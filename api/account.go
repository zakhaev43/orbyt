package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/token"
)

type createAccountRequest struct {
	Currency string `json:"currency" binding:"required,currency"`
}

func (server *Server) createAccount(ctx *gin.Context) {
	var req createAccountRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	authPayload := ctx.MustGet(authorizationPayloadKey).(*token.Payload)

	account, err := server.store.CreateAccount(ctx, db.CreateAccountParams{
		Owner:    authPayload.Username,
		Currency: req.Currency,
	})
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code.Name() == "unique_violation" {
			ctx.JSON(http.StatusConflict, errorResponse(fmt.Errorf("you already have a %s account", req.Currency)))
			return
		}
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	ctx.JSON(http.StatusOK, account)
}

type accountURI struct {
	ID int64 `uri:"id" binding:"required,min=1"`
}

// loadOwnedAccount writes the error response itself and returns false when
// the account doesn't exist or isn't the caller's.
func (server *Server) loadOwnedAccount(ctx *gin.Context, id int64) (db.Account, bool) {
	account, err := server.store.GetAccount(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, errorResponse(errors.New("account not found")))
			return account, false
		}
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return account, false
	}

	authPayload := ctx.MustGet(authorizationPayloadKey).(*token.Payload)
	if account.Owner != authPayload.Username {
		ctx.JSON(http.StatusForbidden, errorResponse(errors.New("account does not belong to the authenticated user")))
		return account, false
	}
	return account, true
}

func (server *Server) getAccount(ctx *gin.Context) {
	var uri accountURI
	if err := ctx.ShouldBindUri(&uri); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	account, ok := server.loadOwnedAccount(ctx, uri.ID)
	if !ok {
		return
	}
	ctx.JSON(http.StatusOK, account)
}

type listAccountRequest struct {
	PageID   int32 `form:"page_id" binding:"required,min=1"`
	PageSize int32 `form:"page_size" binding:"required,min=5,max=10"`
}

func (server *Server) listAccount(ctx *gin.Context) {
	var req listAccountRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	authPayload := ctx.MustGet(authorizationPayloadKey).(*token.Payload)

	accounts, err := server.store.ListAccounts(ctx, db.ListAccountsParams{
		Owner:  authPayload.Username,
		Limit:  req.PageSize,
		Offset: (req.PageID - 1) * req.PageSize,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	ctx.JSON(http.StatusOK, accounts)
}

// Amounts are minor units; a single top-up is capped at 10,000,000.00.
type depositRequest struct {
	Amount      int64  `json:"amount" binding:"required,gt=0,lte=1000000000"`
	Description string `json:"description" binding:"max=140"`
}

type depositResponse struct {
	Transaction db.Transaction `json:"transaction"`
	Account     db.Account     `json:"account"`
}

func (server *Server) createDeposit(ctx *gin.Context) {
	var uri accountURI
	if err := ctx.ShouldBindUri(&uri); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}
	var req depositRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	if _, ok := server.loadOwnedAccount(ctx, uri.ID); !ok {
		return
	}

	description := strings.TrimSpace(req.Description)
	if description == "" {
		description = "Top-up"
	}

	result, err := server.store.DepositTx(ctx, db.DepositTxParams{
		AccountID:   uri.ID,
		Amount:      req.Amount,
		Description: description,
	})
	if err != nil {
		respondLedgerError(ctx, err)
		return
	}

	ctx.JSON(http.StatusOK, depositResponse{Transaction: result.Transaction, Account: result.Account})
}

type statusTransition struct {
	from string
	to   string
}

var (
	freezeTransition   = statusTransition{from: db.AccountStatusActive, to: db.AccountStatusFrozen}
	unfreezeTransition = statusTransition{from: db.AccountStatusFrozen, to: db.AccountStatusActive}
	closeTransition    = statusTransition{from: db.AccountStatusActive, to: db.AccountStatusClosed}
)

func (server *Server) freezeAccount(ctx *gin.Context) {
	server.changeAccountStatus(ctx, freezeTransition)
}
func (server *Server) unfreezeAccount(ctx *gin.Context) {
	server.changeAccountStatus(ctx, unfreezeTransition)
}
func (server *Server) closeAccount(ctx *gin.Context) {
	server.changeAccountStatus(ctx, closeTransition)
}

func (server *Server) changeAccountStatus(ctx *gin.Context, t statusTransition) {
	var uri accountURI
	if err := ctx.ShouldBindUri(&uri); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	account, ok := server.loadOwnedAccount(ctx, uri.ID)
	if !ok {
		return
	}

	if account.Status != t.from {
		ctx.JSON(http.StatusConflict, errorResponse(fmt.Errorf("account is %s; only %s accounts can become %s", account.Status, t.from, t.to)))
		return
	}
	if t.to == db.AccountStatusClosed && account.Balance != 0 {
		ctx.JSON(http.StatusUnprocessableEntity, errorResponse(errors.New("move the remaining balance out before closing this account")))
		return
	}

	updated, err := server.store.UpdateAccountStatus(ctx, db.UpdateAccountStatusParams{
		ID:         account.ID,
		Owner:      account.Owner,
		FromStatus: t.from,
		NewStatus:  t.to,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			ctx.JSON(http.StatusConflict, errorResponse(errors.New("account changed while processing the request; please retry")))
			return
		}
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	ctx.JSON(http.StatusOK, updated)
}

type statementRequest struct {
	PageID   int32 `form:"page_id" binding:"required,min=1"`
	PageSize int32 `form:"page_size" binding:"required,min=5,max=50"`
}

type statementLine struct {
	EntryID               int64     `json:"entry_id"`
	TransactionID         *int64    `json:"transaction_id"`
	Kind                  string    `json:"kind"`
	Description           string    `json:"description"`
	Amount                int64     `json:"amount"`
	BalanceAfter          int64     `json:"balance_after"`
	CounterpartyAccountID int64     `json:"counterparty_account_id,omitempty"`
	CounterpartyOwner     string    `json:"counterparty_owner,omitempty"`
	CounterpartyIsSystem  bool      `json:"counterparty_is_system"`
	CreatedAt             time.Time `json:"created_at"`
}

func (server *Server) getAccountStatement(ctx *gin.Context) {
	var uri accountURI
	if err := ctx.ShouldBindUri(&uri); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}
	var req statementRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	if _, ok := server.loadOwnedAccount(ctx, uri.ID); !ok {
		return
	}

	rows, err := server.store.ListAccountStatement(ctx, db.ListAccountStatementParams{
		AccountID:  uri.ID,
		PageLimit:  req.PageSize,
		PageOffset: (req.PageID - 1) * req.PageSize,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	lines := make([]statementLine, 0, len(rows))
	for _, row := range rows {
		line := statementLine{
			EntryID:               row.ID,
			Kind:                  row.Kind,
			Description:           row.Description,
			Amount:                row.Amount,
			BalanceAfter:          row.BalanceAfter,
			CounterpartyAccountID: row.CounterpartyAccountID,
			CounterpartyIsSystem:  row.CounterpartyKind == db.AccountKindSystem,
			CreatedAt:             row.CreatedAt,
		}
		if row.TransactionID.Valid {
			id := row.TransactionID.Int64
			line.TransactionID = &id
		}
		if !line.CounterpartyIsSystem {
			line.CounterpartyOwner = row.CounterpartyOwner
		}
		lines = append(lines, line)
	}

	ctx.JSON(http.StatusOK, lines)
}

type payeeResponse struct {
	AccountID  int64  `json:"account_id"`
	Currency   string `json:"currency"`
	HolderName string `json:"holder_name"`
	Username   string `json:"username"`
	CanReceive bool   `json:"can_receive"`
}

// getPayee lets a sender confirm who they're paying before sending money.
func (server *Server) getPayee(ctx *gin.Context) {
	var uri accountURI
	if err := ctx.ShouldBindUri(&uri); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	account, err := server.store.GetAccount(ctx, uri.ID)
	if err != nil || account.Kind != db.AccountKindCustomer || account.Status == db.AccountStatusClosed {
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			ctx.JSON(http.StatusInternalServerError, errorResponse(err))
			return
		}
		ctx.JSON(http.StatusNotFound, errorResponse(errors.New("no account with that number")))
		return
	}

	owner, err := server.store.GetUser(ctx, account.Owner)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	ctx.JSON(http.StatusOK, payeeResponse{
		AccountID:  account.ID,
		Currency:   account.Currency,
		HolderName: maskName(owner.FullName),
		Username:   owner.Username,
		CanReceive: account.Status == db.AccountStatusActive,
	})
}

// maskName shows the first name and last initial: "Ada Lovelace" -> "Ada L."
func maskName(fullName string) string {
	parts := strings.Fields(fullName)
	switch len(parts) {
	case 0:
		return ""
	case 1:
		return parts[0]
	}
	last := []rune(parts[len(parts)-1])
	return parts[0] + " " + strings.ToUpper(string(last[0])) + "."
}

// respondLedgerError maps store errors from money-moving transactions to
// HTTP responses.
func respondLedgerError(ctx *gin.Context, err error) {
	var stateErr *db.AccountStateError
	switch {
	case errors.Is(err, db.ErrInsufficientFunds):
		ctx.JSON(http.StatusUnprocessableEntity, errorResponse(err))
	case errors.As(err, &stateErr):
		ctx.JSON(http.StatusConflict, errorResponse(err))
	case errors.Is(err, db.ErrCurrencyMismatch),
		errors.Is(err, db.ErrSameAccount),
		errors.Is(err, db.ErrInvalidCounterparty):
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
	case errors.Is(err, sql.ErrNoRows):
		ctx.JSON(http.StatusNotFound, errorResponse(errors.New("account not found")))
	default:
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
	}
}
