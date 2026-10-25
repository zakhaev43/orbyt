package db

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zakhaev43/orbyt/util"
)

func TestBackdatedTransfer(t *testing.T) {
	ctx := context.Background()
	at := time.Now().Add(-72 * time.Hour).Truncate(time.Microsecond)

	sender := createAccountInCurrency(t, util.GBP)
	_, err := testStore.DepositTx(ctx, DepositTxParams{AccountID: sender.ID, Amount: 1000, At: at.Add(-time.Hour)})
	require.NoError(t, err)
	recipient := createAccountInCurrency(t, util.GBP)

	result, err := testStore.TransferTx(ctx, TransferTxParams{
		FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 250, Currency: util.GBP, At: at,
	})
	require.NoError(t, err)

	require.True(t, result.Transaction.CreatedAt.Equal(at))
	require.True(t, result.Transfer.CreatedAt.Equal(at))
	require.True(t, result.FromEntry.CreatedAt.Equal(at))
	require.True(t, result.ToEntry.CreatedAt.Equal(at))

	// The hash chain covers created_at, so backdated entries must still verify.
	report, err := testStore.VerifyLedger(ctx)
	require.NoError(t, err)
	require.True(t, report.Valid())
}

func TestUndatedTransferUsesNow(t *testing.T) {
	ctx := context.Background()
	sender := createFundedAccount(t, util.CAD, 500)
	recipient := createAccountInCurrency(t, util.CAD)

	result, err := testStore.TransferTx(ctx, TransferTxParams{
		FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 100, Currency: util.CAD,
	})
	require.NoError(t, err)
	require.WithinDuration(t, time.Now(), result.Transaction.CreatedAt, 5*time.Second)
}

func TestAdminListTransactions(t *testing.T) {
	ctx := context.Background()
	sender := createFundedAccount(t, util.EUR, 900)
	recipient := createAccountInCurrency(t, util.EUR)
	transfer, err := testStore.TransferTx(ctx, TransferTxParams{
		FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 300, Currency: util.EUR, Description: "audit me",
	})
	require.NoError(t, err)

	rows, err := testQueries.AdminListTransactions(ctx, AdminListTransactionsParams{
		Kind:      sql.NullString{String: TransactionKindTransfer, Valid: true},
		Currency:  sql.NullString{String: util.EUR, Valid: true},
		PageLimit: 50,
	})
	require.NoError(t, err)
	require.NotEmpty(t, rows)

	newest := rows[0]
	require.Equal(t, transfer.Transaction.ID, newest.ID)
	require.Equal(t, sender.ID, newest.FromAccountID)
	require.Equal(t, sender.Owner, newest.FromOwner)
	require.Equal(t, recipient.ID, newest.ToAccountID)
	require.Equal(t, recipient.Owner, newest.ToOwner)
	require.Equal(t, "audit me", newest.Description)
	for _, row := range rows {
		require.Equal(t, TransactionKindTransfer, row.Kind)
		require.Equal(t, util.EUR, row.Currency)
	}
}

func TestAdminSummaries(t *testing.T) {
	ctx := context.Background()
	createFundedAccount(t, util.USD, 1234)

	users, err := testQueries.AdminCountUsers(ctx, time.Now().Add(-time.Hour))
	require.NoError(t, err)
	require.Positive(t, users.Total)
	require.Positive(t, users.NewSince)

	accounts, err := testQueries.AdminAccountSummary(ctx)
	require.NoError(t, err)
	var usd *AdminAccountSummaryRow
	for i := range accounts {
		if accounts[i].Currency == util.USD {
			usd = &accounts[i]
		}
	}
	require.NotNil(t, usd)
	require.GreaterOrEqual(t, usd.Balances, int64(1234))

	daily, err := testQueries.AdminDailyActivity(ctx, time.Now().AddDate(0, 0, -1))
	require.NoError(t, err)
	require.NotEmpty(t, daily)

	// System accounts are excluded from the user list.
	list, err := testQueries.AdminListUsers(ctx, AdminListUsersParams{
		Search:    sql.NullString{String: "_system", Valid: true},
		PageLimit: 10,
	})
	require.NoError(t, err)
	require.Empty(t, list)
}
