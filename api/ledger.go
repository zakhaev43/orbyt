package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	db "github.com/zakhaev43/orbyt/db/sqlc"
)

type verifyLedgerResponse struct {
	Valid                  bool  `json:"valid"`
	ChainValid             bool  `json:"chain_valid"`
	BrokenEntry            int64 `json:"broken_entry_id,omitempty"`
	BalanceMismatches      int   `json:"balance_mismatches"`
	UnbalancedTransactions int   `json:"unbalanced_transactions"`
	EntriesChecked         int   `json:"entries_checked"`
}

// verifyLedger reports only counts: it is open to every signed-in user, so
// it must not reveal which accounts or amounts are involved.
func (server *Server) verifyLedger(ctx *gin.Context) {
	report, err := server.store.VerifyLedger(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	ctx.JSON(http.StatusOK, newVerifyLedgerResponse(report))
}

func newVerifyLedgerResponse(report db.LedgerReport) verifyLedgerResponse {
	return verifyLedgerResponse{
		Valid:                  report.Valid(),
		ChainValid:             report.ChainValid,
		BrokenEntry:            report.BrokenEntryID,
		BalanceMismatches:      len(report.BalanceMismatches),
		UnbalancedTransactions: len(report.UnbalancedTransactions),
		EntriesChecked:         report.EntriesChecked,
	}
}
