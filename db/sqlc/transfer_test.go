package db

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zakhaev43/orbyt/util"
)

func createRandomTransfer(t *testing.T, from, to Account) Transfer {
	result, err := testStore.TransferTx(context.Background(), TransferTxParams{
		FromAccountID: from.ID,
		ToAccountID:   to.ID,
		Amount:        util.RandomInt(1, 10),
		Currency:      from.Currency,
	})
	require.NoError(t, err)
	require.True(t, result.Transfer.TransactionID.Valid)
	return result.Transfer
}

func TestGetTransfer(t *testing.T) {
	account1 := createFundedAccount(t, util.USD, 1000)
	account2 := createAccountInCurrency(t, util.USD)
	transfer1 := createRandomTransfer(t, account1, account2)

	transfer2, err := testQueries.GetTransfer(context.Background(), transfer1.ID)
	require.NoError(t, err)
	require.Equal(t, transfer1.ID, transfer2.ID)
	require.Equal(t, transfer1.FromAccountID, transfer2.FromAccountID)
	require.Equal(t, transfer1.ToAccountID, transfer2.ToAccountID)
	require.Equal(t, transfer1.Amount, transfer2.Amount)
	require.Equal(t, transfer1.TransactionID, transfer2.TransactionID)
	require.WithinDuration(t, transfer1.CreatedAt, transfer2.CreatedAt, time.Second)
}

func TestListTransfer(t *testing.T) {
	account1 := createFundedAccount(t, util.EUR, 1000)
	account2 := createFundedAccount(t, util.EUR, 1000)

	for i := 0; i < 5; i++ {
		createRandomTransfer(t, account1, account2)
		createRandomTransfer(t, account2, account1)
	}

	transfers, err := testQueries.ListTransfers(context.Background(), ListTransfersParams{
		FromAccountID: account1.ID,
		ToAccountID:   account1.ID,
		Limit:         5,
		Offset:        5,
	})
	require.NoError(t, err)
	require.Len(t, transfers, 5)
	for _, transfer := range transfers {
		require.True(t, transfer.FromAccountID == account1.ID || transfer.ToAccountID == account1.ID)
	}
}
