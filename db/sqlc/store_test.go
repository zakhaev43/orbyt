package db

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zakhaev43/orbyt/util"
)

func TestTransferTx(t *testing.T) {
	account1 := createFundedAccount(t, util.USD, 1000)
	account2 := createAccountInCurrency(t, util.USD)

	n := 5
	amount := int64(10)

	errs := make(chan error)
	results := make(chan TransferTxResult)

	for i := 0; i < n; i++ {
		go func() {
			result, err := testStore.TransferTx(context.Background(), TransferTxParams{
				FromAccountID: account1.ID,
				ToAccountID:   account2.ID,
				Amount:        amount,
				Currency:      util.USD,
			})
			errs <- err
			results <- result
		}()
	}

	existed := make(map[int]bool)

	for i := 0; i < n; i++ {
		require.NoError(t, <-errs)
		result := <-results

		require.Equal(t, TransactionKindTransfer, result.Transaction.Kind)
		require.Equal(t, amount, result.Transaction.Amount)
		require.Equal(t, util.USD, result.Transaction.Currency)

		transfer := result.Transfer
		require.Equal(t, account1.ID, transfer.FromAccountID)
		require.Equal(t, account2.ID, transfer.ToAccountID)
		require.Equal(t, amount, transfer.Amount)
		require.Equal(t, result.Transaction.ID, transfer.TransactionID.Int64)

		require.Equal(t, account1.ID, result.FromEntry.AccountID)
		require.Equal(t, -amount, result.FromEntry.Amount)
		require.Equal(t, account2.ID, result.ToEntry.AccountID)
		require.Equal(t, amount, result.ToEntry.Amount)
		require.Equal(t, result.Transaction.ID, result.FromEntry.TransactionID.Int64)
		require.Equal(t, result.Transaction.ID, result.ToEntry.TransactionID.Int64)
		require.Equal(t, result.FromEntry.Hash, result.ToEntry.PrevHash)

		diff1 := account1.Balance - result.FromAccount.Balance
		diff2 := result.ToAccount.Balance - account2.Balance
		require.Equal(t, diff1, diff2)
		require.True(t, diff1 > 0)
		require.True(t, diff1%amount == 0)

		k := int(diff1 / amount)
		require.True(t, k >= 1 && k <= n)
		require.NotContains(t, existed, k)
		existed[k] = true
	}

	updated1, err := testQueries.GetAccount(context.Background(), account1.ID)
	require.NoError(t, err)
	updated2, err := testQueries.GetAccount(context.Background(), account2.ID)
	require.NoError(t, err)

	require.Equal(t, account1.Balance-int64(n)*amount, updated1.Balance)
	require.Equal(t, account2.Balance+int64(n)*amount, updated2.Balance)
}

// Transfers in both directions between the same two accounts would deadlock
// without consistent lock ordering.
func TestTransferTxOppositeDirectionsDoNotDeadlock(t *testing.T) {
	account1 := createFundedAccount(t, util.EUR, 1000)
	account2 := createFundedAccount(t, util.EUR, 1000)

	n := 10
	amount := int64(10)
	errs := make(chan error, n)

	for i := 0; i < n; i++ {
		from, to := account1.ID, account2.ID
		if i%2 == 1 {
			from, to = to, from
		}
		go func() {
			_, err := testStore.TransferTx(context.Background(), TransferTxParams{
				FromAccountID: from, ToAccountID: to, Amount: amount, Currency: util.EUR,
			})
			errs <- err
		}()
	}

	for i := 0; i < n; i++ {
		require.NoError(t, <-errs)
	}

	updated1, err := testQueries.GetAccount(context.Background(), account1.ID)
	require.NoError(t, err)
	updated2, err := testQueries.GetAccount(context.Background(), account2.ID)
	require.NoError(t, err)
	require.Equal(t, account1.Balance, updated1.Balance)
	require.Equal(t, account2.Balance, updated2.Balance)
}

// Concurrent transfers that together exceed the balance must not overdraw it:
// the funds check happens under the row lock.
func TestTransferTxConcurrentOverdraftAttempts(t *testing.T) {
	sender := createFundedAccount(t, util.GBP, 100)
	recipient := createAccountInCurrency(t, util.GBP)

	n := 10
	var wg sync.WaitGroup
	var mu sync.Mutex
	succeeded, rejected := 0, 0

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := testStore.TransferTx(context.Background(), TransferTxParams{
				FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 30, Currency: util.GBP,
			})
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				succeeded++
			case errors.Is(err, ErrInsufficientFunds):
				rejected++
			default:
				t.Errorf("unexpected error: %v", err)
			}
		}()
	}
	wg.Wait()

	require.Equal(t, 3, succeeded)
	require.Equal(t, n-3, rejected)

	updated, err := testQueries.GetAccount(context.Background(), sender.ID)
	require.NoError(t, err)
	require.Equal(t, int64(10), updated.Balance)
}

func TestTransferTxInsufficientFunds(t *testing.T) {
	sender := createFundedAccount(t, util.USD, 50)
	recipient := createAccountInCurrency(t, util.USD)

	_, err := testStore.TransferTx(context.Background(), TransferTxParams{
		FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 51, Currency: util.USD,
	})
	require.ErrorIs(t, err, ErrInsufficientFunds)

	unchanged, err := testQueries.GetAccount(context.Background(), sender.ID)
	require.NoError(t, err)
	require.Equal(t, int64(50), unchanged.Balance)
}

func TestTransferTxRequiresActiveAccounts(t *testing.T) {
	ctx := context.Background()

	for _, status := range []string{AccountStatusFrozen, AccountStatusClosed} {
		for _, side := range []string{"sender", "recipient"} {
			t.Run(status+"_"+side, func(t *testing.T) {
				sender := createFundedAccount(t, util.USD, 100)
				recipient := createAccountInCurrency(t, util.USD)

				blocked := recipient
				if side == "sender" {
					blocked = sender
				}
				if status == AccountStatusClosed && side == "sender" {
					// A funded account can't be closed, so force it for the test.
					_, err := testDB.ExecContext(ctx, "UPDATE accounts SET status = 'closed' WHERE id = $1", blocked.ID)
					require.NoError(t, err)
				} else {
					_, err := testQueries.UpdateAccountStatus(ctx, UpdateAccountStatusParams{
						ID: blocked.ID, Owner: blocked.Owner, FromStatus: AccountStatusActive, NewStatus: status,
					})
					require.NoError(t, err)
				}

				_, err := testStore.TransferTx(ctx, TransferTxParams{
					FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 10, Currency: util.USD,
				})
				require.ErrorIs(t, err, ErrAccountNotActive)

				var stateErr *AccountStateError
				require.ErrorAs(t, err, &stateErr)
				require.Equal(t, blocked.ID, stateErr.AccountID)
				require.Equal(t, status, stateErr.Status)
			})
		}
	}
}

func TestTransferTxCurrencyMismatch(t *testing.T) {
	sender := createFundedAccount(t, util.USD, 100)
	recipient := createAccountInCurrency(t, util.EUR)

	_, err := testStore.TransferTx(context.Background(), TransferTxParams{
		FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 10, Currency: util.USD,
	})
	require.ErrorIs(t, err, ErrCurrencyMismatch)
}

func TestTransferTxRejectsSystemAccounts(t *testing.T) {
	sender := createFundedAccount(t, util.USD, 100)
	treasury, err := testQueries.GetSystemAccount(context.Background(), util.USD)
	require.NoError(t, err)

	_, err = testStore.TransferTx(context.Background(), TransferTxParams{
		FromAccountID: sender.ID, ToAccountID: treasury.ID, Amount: 10, Currency: util.USD,
	})
	require.ErrorIs(t, err, ErrInvalidCounterparty)

	_, err = testStore.TransferTx(context.Background(), TransferTxParams{
		FromAccountID: treasury.ID, ToAccountID: sender.ID, Amount: 10, Currency: util.USD,
	})
	require.ErrorIs(t, err, ErrInvalidCounterparty)
}

func TestTransferTxSameAccount(t *testing.T) {
	account := createFundedAccount(t, util.USD, 100)
	_, err := testStore.TransferTx(context.Background(), TransferTxParams{
		FromAccountID: account.ID, ToAccountID: account.ID, Amount: 10, Currency: util.USD,
	})
	require.ErrorIs(t, err, ErrSameAccount)
}

func TestDepositTx(t *testing.T) {
	ctx := context.Background()
	account := createAccountInCurrency(t, util.CAD)
	treasuryBefore, err := testQueries.GetSystemAccount(ctx, util.CAD)
	require.NoError(t, err)

	result, err := testStore.DepositTx(ctx, DepositTxParams{AccountID: account.ID, Amount: 4250, Description: "Top-up"})
	require.NoError(t, err)

	require.Equal(t, TransactionKindDeposit, result.Transaction.Kind)
	require.Equal(t, util.CAD, result.Transaction.Currency)
	require.Equal(t, "Top-up", result.Transaction.Description)
	require.Equal(t, int64(4250), result.Account.Balance)
	require.Equal(t, int64(4250), result.Entry.Amount)

	treasuryAfter, err := testQueries.GetSystemAccount(ctx, util.CAD)
	require.NoError(t, err)
	require.Equal(t, treasuryBefore.Balance-4250, treasuryAfter.Balance)
}

func TestDepositTxRequiresActiveAccount(t *testing.T) {
	account := createRandomAccount(t)
	_, err := testQueries.UpdateAccountStatus(context.Background(), UpdateAccountStatusParams{
		ID: account.ID, Owner: account.Owner, FromStatus: AccountStatusActive, NewStatus: AccountStatusFrozen,
	})
	require.NoError(t, err)

	_, err = testStore.DepositTx(context.Background(), DepositTxParams{AccountID: account.ID, Amount: 100})
	require.ErrorIs(t, err, ErrAccountNotActive)
}

func TestVerifyLedger(t *testing.T) {
	ctx := context.Background()
	sender := createFundedAccount(t, util.USD, 1000)
	recipient := createAccountInCurrency(t, util.USD)
	result, err := testStore.TransferTx(ctx, TransferTxParams{
		FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: 100, Currency: util.USD,
	})
	require.NoError(t, err)

	report, err := testStore.VerifyLedger(ctx)
	require.NoError(t, err)
	require.True(t, report.ChainValid)
	require.Empty(t, report.BalanceMismatches)
	require.Empty(t, report.UnbalancedTransactions)
	require.True(t, report.Valid())

	// Tamper with a hash, check the audit catches it, then restore it.
	original := result.ToEntry
	_, err = testQueries.SetEntryHash(ctx, SetEntryHashParams{ID: original.ID, PrevHash: original.PrevHash, Hash: "forged"})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, err := testQueries.SetEntryHash(ctx, SetEntryHashParams{ID: original.ID, PrevHash: original.PrevHash, Hash: original.Hash})
		require.NoError(t, err)
	})

	report, err = testStore.VerifyLedger(ctx)
	require.NoError(t, err)
	require.False(t, report.ChainValid)
	require.Equal(t, original.ID, report.BrokenEntryID)
	require.False(t, report.Valid())
}

func TestVerifyLedgerDetectsBalanceDrift(t *testing.T) {
	ctx := context.Background()
	account := createFundedAccount(t, util.EUR, 500)

	// Change the cached balance behind the ledger's back.
	_, err := testQueries.AddAccountBalance(ctx, AddAccountBalanceParams{ID: account.ID, Amount: 1})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, err := testQueries.AddAccountBalance(ctx, AddAccountBalanceParams{ID: account.ID, Amount: -1})
		require.NoError(t, err)
	})

	report, err := testStore.VerifyLedger(ctx)
	require.NoError(t, err)
	require.False(t, report.Valid())

	found := false
	for _, m := range report.BalanceMismatches {
		if m.ID == account.ID {
			found = true
			require.Equal(t, int64(501), m.Balance)
			require.Equal(t, int64(500), m.LedgerBalance)
		}
	}
	require.True(t, found)
}
