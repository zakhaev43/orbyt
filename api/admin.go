package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/token"
)

const RoleAdmin = "admin"

// adminMiddleware must run after authMiddleware. The role is read from the
// database on every request rather than trusted from the token, so revoking
// admin takes effect immediately.
func (server *Server) adminMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		payload := ctx.MustGet(authorizationPayloadKey).(*token.Payload)

		user, err := server.store.GetUser(ctx, payload.Username)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				ctx.AbortWithStatusJSON(http.StatusForbidden, errorResponse(errors.New("admin access required")))
				return
			}
			ctx.AbortWithStatusJSON(http.StatusInternalServerError, errorResponse(err))
			return
		}
		if user.Role != RoleAdmin {
			ctx.AbortWithStatusJSON(http.StatusForbidden, errorResponse(errors.New("admin access required")))
			return
		}
		ctx.Next()
	}
}

type flowStats struct {
	Count       int64 `json:"count"`
	Volume      int64 `json:"volume"`
	Count30d    int64 `json:"count_30d"`
	Volume30d   int64 `json:"volume_30d"`
	AverageSize int64 `json:"average_size"`
}

type currencyStats struct {
	Currency     string    `json:"currency"`
	Accounts     int64     `json:"accounts"`
	Active       int64     `json:"active"`
	Frozen       int64     `json:"frozen"`
	Closed       int64     `json:"closed"`
	BalancesHeld int64     `json:"balances_held"`
	Transfers    flowStats `json:"transfers"`
	Deposits     flowStats `json:"deposits"`
}

type adminStatsResponse struct {
	GeneratedAt time.Time               `json:"generated_at"`
	Users       db.AdminCountUsersRow   `json:"users"`
	Currencies  []currencyStats         `json:"currencies"`
	TopSenders  []db.AdminTopSendersRow `json:"top_senders"`
	Ledger      verifyLedgerResponse    `json:"ledger"`
}

func (server *Server) adminStats(ctx *gin.Context) {
	since := time.Now().AddDate(0, 0, -30)

	users, err := server.store.AdminCountUsers(ctx, since)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}
	accountRows, err := server.store.AdminAccountSummary(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}
	txRows, err := server.store.AdminTransactionSummary(ctx, since)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}
	topSenders, err := server.store.AdminTopSenders(ctx, db.AdminTopSendersParams{Since: since, RowLimit: 8})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}
	report, err := server.store.VerifyLedger(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	byCurrency := map[string]*currencyStats{}
	var order []string
	get := func(currency string) *currencyStats {
		if s, ok := byCurrency[currency]; ok {
			return s
		}
		s := &currencyStats{Currency: currency}
		byCurrency[currency] = s
		order = append(order, currency)
		return s
	}

	for _, row := range accountRows {
		s := get(row.Currency)
		s.Accounts, s.Active, s.Frozen, s.Closed, s.BalancesHeld = row.Accounts, row.Active, row.Frozen, row.Closed, row.Balances
	}
	for _, row := range txRows {
		flow := flowStats{Count: row.Count, Volume: row.Volume, Count30d: row.CountSince, Volume30d: row.VolumeSince}
		if row.Count > 0 {
			flow.AverageSize = row.Volume / row.Count
		}
		s := get(row.Currency)
		switch row.Kind {
		case db.TransactionKindTransfer:
			s.Transfers = flow
		case db.TransactionKindDeposit:
			s.Deposits = flow
		}
	}

	currencies := make([]currencyStats, 0, len(order))
	for _, c := range order {
		currencies = append(currencies, *byCurrency[c])
	}

	ctx.JSON(http.StatusOK, adminStatsResponse{
		GeneratedAt: time.Now().UTC(),
		Users:       users,
		Currencies:  currencies,
		TopSenders:  topSenders,
		Ledger:      newVerifyLedgerResponse(report),
	})
}

type adminActivityRequest struct {
	Days int `form:"days" binding:"omitempty,min=1,max=365"`
}

type activityPoint struct {
	Day      string `json:"day"`
	Currency string `json:"currency"`
	Kind     string `json:"kind"`
	Count    int64  `json:"count"`
	Volume   int64  `json:"volume"`
}

func (server *Server) adminActivity(ctx *gin.Context) {
	var req adminActivityRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}
	if req.Days == 0 {
		req.Days = 30
	}

	now := time.Now().UTC()
	since := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -(req.Days - 1))

	rows, err := server.store.AdminDailyActivity(ctx, since)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	points := make([]activityPoint, 0, len(rows))
	for _, row := range rows {
		points = append(points, activityPoint{
			Day:      row.Day.Format("2006-01-02"),
			Currency: row.Currency,
			Kind:     row.Kind,
			Count:    row.Count,
			Volume:   row.Volume,
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"since": since.Format("2006-01-02"), "days": req.Days, "points": points})
}

type adminTransactionsRequest struct {
	PageID   int32  `form:"page_id" binding:"required,min=1"`
	PageSize int32  `form:"page_size" binding:"required,min=5,max=100"`
	Kind     string `form:"kind" binding:"omitempty,oneof=transfer deposit"`
	Currency string `form:"currency" binding:"omitempty,currency"`
}

func optionalString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

func (server *Server) adminTransactions(ctx *gin.Context) {
	var req adminTransactionsRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	rows, err := server.store.AdminListTransactions(ctx, db.AdminListTransactionsParams{
		Kind:       optionalString(req.Kind),
		Currency:   optionalString(req.Currency),
		PageLimit:  req.PageSize,
		PageOffset: (req.PageID - 1) * req.PageSize,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}
	ctx.JSON(http.StatusOK, rows)
}

type adminUsersRequest struct {
	PageID   int32  `form:"page_id" binding:"required,min=1"`
	PageSize int32  `form:"page_size" binding:"required,min=5,max=100"`
	Search   string `form:"search" binding:"max=100"`
}

func (server *Server) adminUsers(ctx *gin.Context) {
	var req adminUsersRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	rows, err := server.store.AdminListUsers(ctx, db.AdminListUsersParams{
		Search:     optionalString(strings.TrimSpace(req.Search)),
		PageLimit:  req.PageSize,
		PageOffset: (req.PageID - 1) * req.PageSize,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}
	ctx.JSON(http.StatusOK, rows)
}
