package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	db "github.com/zakhaev43/orbyt/db/sqlc"
)

// Amount is in minor units (e.g. cents).
type transferRequest struct {
	FromAccountID int64  `json:"from_account_id" binding:"required,min=1"`
	ToAccountID   int64  `json:"to_account_id" binding:"required,min=1,nefield=FromAccountID"`
	Amount        int64  `json:"amount" binding:"required,gt=0"`
	Currency      string `json:"currency" binding:"required,currency"`
	Description   string `json:"description" binding:"max=140"`
}

type transferRecord struct {
	ID            int64     `json:"id"`
	TransactionID *int64    `json:"transaction_id"`
	FromAccountID int64     `json:"from_account_id"`
	ToAccountID   int64     `json:"to_account_id"`
	Amount        int64     `json:"amount"`
	CreatedAt     time.Time `json:"created_at"`
}

func newTransferRecord(t db.Transfer) transferRecord {
	record := transferRecord{
		ID:            t.ID,
		FromAccountID: t.FromAccountID,
		ToAccountID:   t.ToAccountID,
		Amount:        t.Amount,
		CreatedAt:     t.CreatedAt,
	}
	if t.TransactionID.Valid {
		id := t.TransactionID.Int64
		record.TransactionID = &id
	}
	return record
}

// The recipient's account is deliberately left out: the sender must not
// learn the recipient's balance.
type transferResponse struct {
	Transaction db.Transaction `json:"transaction"`
	Transfer    transferRecord `json:"transfer"`
	FromAccount db.Account     `json:"from_account"`
}

func (server *Server) createTransfer(ctx *gin.Context) {
	var req transferRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	auditDetail(ctx, "from_account_id", req.FromAccountID)
	auditDetail(ctx, "to_account_id", req.ToAccountID)
	auditDetail(ctx, "amount", req.Amount)
	auditDetail(ctx, "currency", req.Currency)
	if _, ok := server.loadOwnedAccount(ctx, req.FromAccountID); !ok {
		return
	}

	result, err := server.store.TransferTx(ctx, db.TransferTxParams{
		FromAccountID: req.FromAccountID,
		ToAccountID:   req.ToAccountID,
		Amount:        req.Amount,
		Currency:      req.Currency,
		Description:   strings.TrimSpace(req.Description),
	})
	if err != nil {
		respondLedgerError(ctx, err)
		return
	}

	auditTarget(ctx, "transaction", result.Transaction.ID)
	ctx.JSON(http.StatusOK, transferResponse{
		Transaction: result.Transaction,
		Transfer:    newTransferRecord(result.Transfer),
		FromAccount: result.FromAccount,
	})
}

type listTransfersRequest struct {
	AccountID int64 `form:"account_id" binding:"required,min=1"`
	PageID    int32 `form:"page_id" binding:"required,min=1"`
	PageSize  int32 `form:"page_size" binding:"required,min=5,max=20"`
}

func (server *Server) listTransfers(ctx *gin.Context) {
	var req listTransfersRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	if _, ok := server.loadOwnedAccount(ctx, req.AccountID); !ok {
		return
	}

	transfers, err := server.store.ListTransfers(ctx, db.ListTransfersParams{
		FromAccountID: req.AccountID,
		ToAccountID:   req.AccountID,
		Limit:         req.PageSize,
		Offset:        (req.PageID - 1) * req.PageSize,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	records := make([]transferRecord, 0, len(transfers))
	for _, t := range transfers {
		records = append(records, newTransferRecord(t))
	}
	ctx.JSON(http.StatusOK, records)
}
