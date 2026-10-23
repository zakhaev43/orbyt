package db

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zakhaev43/Swift-Transfer/util"
)

func createRandomAccount(t *testing.T) Account {
	return createAccountInCurrency(t, util.RandomCurrency())
}

func createAccountInCurrency(t *testing.T, currency string) Account {
	user := createRandomUser(t)
	arg := CreateAccountParams{
		Owner:    user.Username,
		Currency: currency,
	}
	account, err := testQueries.CreateAccount(context.Background(), arg)

	require.NoError(t, err)
	require.Equal(t, arg.Owner, account.Owner)
	require.Equal(t, arg.Currency, account.Currency)
	require.Zero(t, account.Balance)
	require.Equal(t, AccountStatusActive, account.Status)
	require.Equal(t, AccountKindCustomer, account.Kind)
	require.NotZero(t, account.ID)
	require.NotZero(t, account.CreatedAt)

	return account
}

// createFundedAccount opens an account and tops it up through the ledger, so
// its balance is always backed by entries.
func createFundedAccount(t *testing.T, currency string, amount int64) Account {
	account := createAccountInCurrency(t, currency)
	result, err := testStore.DepositTx(context.Background(), DepositTxParams{
		AccountID:   account.ID,
		Amount:      amount,
		Description: "test funding",
	})
	require.NoError(t, err)
	require.Equal(t, amount, result.Account.Balance)
	return result.Account
}

func TestCreateAccount(t *testing.T) {
	createRandomAccount(t)
}

func TestCreateAccountOnePerCurrency(t *testing.T) {
	account := createRandomAccount(t)
	_, err := testQueries.CreateAccount(context.Background(), CreateAccountParams{
		Owner:    account.Owner,
		Currency: account.Currency,
	})
	require.Error(t, err)
}

func TestGetAccount(t *testing.T) {
	account1 := createRandomAccount(t)
	account2, err := testQueries.GetAccount(context.Background(), account1.ID)
	require.NoError(t, err)
	require.Equal(t, account1.ID, account2.ID)
	require.Equal(t, account1.Owner, account2.Owner)
	require.Equal(t, account1.Balance, account2.Balance)
	require.Equal(t, account1.Currency, account2.Currency)
	require.WithinDuration(t, account1.CreatedAt, account2.CreatedAt, time.Second)
}

func TestGetSystemAccount(t *testing.T) {
	for _, currency := range util.SupportedCurrencies {
		account, err := testQueries.GetSystemAccount(context.Background(), currency)
		require.NoError(t, err)
		require.Equal(t, AccountKindSystem, account.Kind)
		require.Equal(t, currency, account.Currency)
	}
}

func TestListAccounts(t *testing.T) {
	user := createRandomUser(t)
	for _, currency := range util.SupportedCurrencies {
		_, err := testQueries.CreateAccount(context.Background(), CreateAccountParams{Owner: user.Username, Currency: currency})
		require.NoError(t, err)
	}

	accounts, err := testQueries.ListAccounts(context.Background(), ListAccountsParams{
		Owner:  user.Username,
		Limit:  10,
		Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, accounts, len(util.SupportedCurrencies))
	for _, account := range accounts {
		require.Equal(t, user.Username, account.Owner)
	}
}

func TestUpdateAccountStatus(t *testing.T) {
	ctx := context.Background()
	account := createRandomAccount(t)

	frozen, err := testQueries.UpdateAccountStatus(ctx, UpdateAccountStatusParams{
		ID: account.ID, Owner: account.Owner, FromStatus: AccountStatusActive, NewStatus: AccountStatusFrozen,
	})
	require.NoError(t, err)
	require.Equal(t, AccountStatusFrozen, frozen.Status)

	// Wrong starting status matches no row.
	_, err = testQueries.UpdateAccountStatus(ctx, UpdateAccountStatusParams{
		ID: account.ID, Owner: account.Owner, FromStatus: AccountStatusActive, NewStatus: AccountStatusClosed,
	})
	require.ErrorIs(t, err, sql.ErrNoRows)

	// Wrong owner matches no row.
	_, err = testQueries.UpdateAccountStatus(ctx, UpdateAccountStatusParams{
		ID: account.ID, Owner: "someone-else", FromStatus: AccountStatusFrozen, NewStatus: AccountStatusActive,
	})
	require.ErrorIs(t, err, sql.ErrNoRows)

	active, err := testQueries.UpdateAccountStatus(ctx, UpdateAccountStatusParams{
		ID: account.ID, Owner: account.Owner, FromStatus: AccountStatusFrozen, NewStatus: AccountStatusActive,
	})
	require.NoError(t, err)
	require.Equal(t, AccountStatusActive, active.Status)

	closed, err := testQueries.UpdateAccountStatus(ctx, UpdateAccountStatusParams{
		ID: account.ID, Owner: account.Owner, FromStatus: AccountStatusActive, NewStatus: AccountStatusClosed,
	})
	require.NoError(t, err)
	require.Equal(t, AccountStatusClosed, closed.Status)
}

func TestCloseAccountRequiresZeroBalance(t *testing.T) {
	account := createFundedAccount(t, util.USD, 500)

	_, err := testQueries.UpdateAccountStatus(context.Background(), UpdateAccountStatusParams{
		ID: account.ID, Owner: account.Owner, FromStatus: AccountStatusActive, NewStatus: AccountStatusClosed,
	})
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestSystemAccountStatusCannotChange(t *testing.T) {
	treasury, err := testQueries.GetSystemAccount(context.Background(), util.USD)
	require.NoError(t, err)

	_, err = testQueries.UpdateAccountStatus(context.Background(), UpdateAccountStatusParams{
		ID: treasury.ID, Owner: treasury.Owner, FromStatus: AccountStatusActive, NewStatus: AccountStatusFrozen,
	})
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestCustomerBalanceCannotGoNegative(t *testing.T) {
	account := createRandomAccount(t)
	_, err := testQueries.AddAccountBalance(context.Background(), AddAccountBalanceParams{ID: account.ID, Amount: -1})
	requirePQCode(t, err, "check_violation")
}
