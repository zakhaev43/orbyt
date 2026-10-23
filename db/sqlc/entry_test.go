package db

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/lib/pq"
	"github.com/stretchr/testify/require"
	"github.com/zakhaev43/Swift-Transfer/util"
)

func requirePQCode(t *testing.T, err error, codeName string) {
	t.Helper()
	require.Error(t, err)
	var pqErr *pq.Error
	require.True(t, errors.As(err, &pqErr), "expected a postgres error, got %v", err)
	require.Equal(t, codeName, pqErr.Code.Name(), pqErr.Message)
}

func TestGetEntry(t *testing.T) {
	account := createAccountInCurrency(t, util.EUR)
	result, err := testStore.DepositTx(context.Background(), DepositTxParams{AccountID: account.ID, Amount: 250})
	require.NoError(t, err)

	entry, err := testQueries.GetEntry(context.Background(), result.Entry.ID)
	require.NoError(t, err)
	require.Equal(t, result.Entry.ID, entry.ID)
	require.Equal(t, account.ID, entry.AccountID)
	require.Equal(t, int64(250), entry.Amount)
	require.Equal(t, result.Transaction.ID, entry.TransactionID.Int64)
	require.NotEmpty(t, entry.Hash)
	require.WithinDuration(t, result.Entry.CreatedAt, entry.CreatedAt, time.Second)
}

func TestListEntries(t *testing.T) {
	account := createAccountInCurrency(t, util.GBP)
	for i := 0; i < 10; i++ {
		_, err := testStore.DepositTx(context.Background(), DepositTxParams{AccountID: account.ID, Amount: 100})
		require.NoError(t, err)
	}

	entries, err := testQueries.ListEntries(context.Background(), ListEntriesParams{
		AccountID: account.ID,
		Limit:     5,
		Offset:    5,
	})
	require.NoError(t, err)
	require.Len(t, entries, 5)
	for _, entry := range entries {
		require.Equal(t, account.ID, entry.AccountID)
	}
}

func TestEntryWithoutTransactionIsRejected(t *testing.T) {
	account := createRandomAccount(t)
	_, err := testQueries.CreateEntry(context.Background(), CreateEntryParams{AccountID: account.ID, Amount: 10})
	requirePQCode(t, err, "check_violation")
}

func TestUnbalancedTransactionIsRejectedAtCommit(t *testing.T) {
	ctx := context.Background()
	account := createAccountInCurrency(t, util.USD)

	tx, err := testDB.BeginTx(ctx, nil)
	require.NoError(t, err)
	q := New(tx)

	txn, err := q.CreateTransaction(ctx, CreateTransactionParams{Kind: TransactionKindDeposit, Currency: util.USD, Amount: 100})
	require.NoError(t, err)
	_, err = q.CreateEntry(ctx, CreateEntryParams{
		AccountID:     account.ID,
		Amount:        100,
		TransactionID: sql.NullInt64{Int64: txn.ID, Valid: true},
	})
	require.NoError(t, err, "the check is deferred, so the insert itself succeeds")

	requirePQCode(t, tx.Commit(), "check_violation")
}

func TestMixedCurrencyTransactionIsRejected(t *testing.T) {
	ctx := context.Background()
	usd := createAccountInCurrency(t, util.USD)
	eur := createAccountInCurrency(t, util.EUR)

	tx, err := testDB.BeginTx(ctx, nil)
	require.NoError(t, err)
	q := New(tx)

	txn, err := q.CreateTransaction(ctx, CreateTransactionParams{Kind: TransactionKindTransfer, Currency: util.USD, Amount: 100})
	require.NoError(t, err)
	for _, p := range []posting{{usd.ID, -100}, {eur.ID, 100}} {
		_, err = q.CreateEntry(ctx, CreateEntryParams{
			AccountID:     p.accountID,
			Amount:        p.amount,
			TransactionID: sql.NullInt64{Int64: txn.ID, Valid: true},
		})
		require.NoError(t, err)
	}

	requirePQCode(t, tx.Commit(), "check_violation")
}

func TestEntriesAreAppendOnly(t *testing.T) {
	ctx := context.Background()
	account := createAccountInCurrency(t, util.CAD)
	result, err := testStore.DepositTx(ctx, DepositTxParams{AccountID: account.ID, Amount: 100})
	require.NoError(t, err)

	_, err = testDB.ExecContext(ctx, "UPDATE entries SET amount = 1000000 WHERE id = $1", result.Entry.ID)
	requirePQCode(t, err, "restrict_violation")

	_, err = testDB.ExecContext(ctx, "DELETE FROM entries WHERE id = $1", result.Entry.ID)
	requirePQCode(t, err, "restrict_violation")
}

func TestListAccountStatement(t *testing.T) {
	ctx := context.Background()
	alice := createFundedAccount(t, util.USD, 1000)
	bob := createAccountInCurrency(t, util.USD)

	_, err := testStore.TransferTx(ctx, TransferTxParams{
		FromAccountID: alice.ID, ToAccountID: bob.ID, Amount: 300, Currency: util.USD, Description: "dinner",
	})
	require.NoError(t, err)

	lines, err := testQueries.ListAccountStatement(ctx, ListAccountStatementParams{AccountID: alice.ID, PageLimit: 10})
	require.NoError(t, err)
	require.Len(t, lines, 2)

	// Newest first, with a running balance.
	require.Equal(t, TransactionKindTransfer, lines[0].Kind)
	require.Equal(t, "dinner", lines[0].Description)
	require.Equal(t, int64(-300), lines[0].Amount)
	require.Equal(t, int64(700), lines[0].BalanceAfter)
	require.Equal(t, bob.ID, lines[0].CounterpartyAccountID)
	require.Equal(t, bob.Owner, lines[0].CounterpartyOwner)

	require.Equal(t, TransactionKindDeposit, lines[1].Kind)
	require.Equal(t, int64(1000), lines[1].BalanceAfter)
	require.Equal(t, AccountKindSystem, lines[1].CounterpartyKind)
}
