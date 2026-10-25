package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	mockdb "github.com/zakhaev43/orbyt/db/mock"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"go.uber.org/mock/gomock"
)

func TestAdminAccessControl(t *testing.T) {
	testCases := []struct {
		name       string
		username   string
		buildStubs func(store *mockdb.MockStore)
		wantStatus int
	}{
		{
			name:       "Unauthenticated",
			buildStubs: func(store *mockdb.MockStore) {},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:     "Customer",
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetUser(gomock.Any(), "alice").Return(db.User{Username: "alice", Role: "customer"}, nil)
				store.EXPECT().AdminListUsers(gomock.Any(), gomock.Any()).Times(0)
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:     "DeletedUser",
			username: "ghost",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetUser(gomock.Any(), "ghost").Return(db.User{}, sql.ErrNoRows)
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:     "Admin",
			username: "root",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetUser(gomock.Any(), "root").Return(db.User{Username: "root", Role: RoleAdmin}, nil)
				store.EXPECT().AdminListUsers(gomock.Any(), db.AdminListUsersParams{
					Search:     sql.NullString{String: "ada", Valid: true},
					PageLimit:  20,
					PageOffset: 20,
				}).Return([]db.AdminListUsersRow{{Username: "ada"}}, nil)
			},
			wantStatus: http.StatusOK,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			store := mockdb.NewMockStore(ctrl)
			tc.buildStubs(store)

			server := newTestServer(t, store)
			recorder := doJSON(t, server, http.MethodGet, "/admin/users?page_id=2&page_size=20&search=%20ada%20", nil, tc.username)
			require.Equal(t, tc.wantStatus, recorder.Code, recorder.Body.String())
		})
	}
}

func TestAdminStats(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)

	store.EXPECT().GetUser(gomock.Any(), "root").Return(db.User{Username: "root", Role: RoleAdmin}, nil)
	store.EXPECT().AdminCountUsers(gomock.Any(), gomock.Any()).Return(db.AdminCountUsersRow{Total: 12, NewSince: 3}, nil)
	store.EXPECT().AdminAccountSummary(gomock.Any()).Return([]db.AdminAccountSummaryRow{
		{Currency: "USD", Accounts: 5, Active: 4, Frozen: 1, Balances: 90_000},
	}, nil)
	store.EXPECT().AdminTransactionSummary(gomock.Any(), gomock.Any()).Return([]db.AdminTransactionSummaryRow{
		{Currency: "USD", Kind: db.TransactionKindTransfer, Count: 4, Volume: 1_000, CountSince: 2, VolumeSince: 600},
		{Currency: "USD", Kind: db.TransactionKindDeposit, Count: 2, Volume: 91_000},
		{Currency: "EUR", Kind: db.TransactionKindDeposit, Count: 1, Volume: 500},
	}, nil)
	store.EXPECT().AdminTopSenders(gomock.Any(), gomock.Any()).Return([]db.AdminTopSendersRow{}, nil)
	store.EXPECT().VerifyLedger(gomock.Any()).Return(db.LedgerReport{ChainValid: true, EntriesChecked: 14}, nil)

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodGet, "/admin/stats", nil, "root")
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	var rsp adminStatsResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &rsp))
	require.Equal(t, int64(12), rsp.Users.Total)
	require.True(t, rsp.Ledger.Valid)
	require.Len(t, rsp.Currencies, 2)

	usd := rsp.Currencies[0]
	require.Equal(t, "USD", usd.Currency)
	require.Equal(t, int64(1), usd.Frozen)
	require.Equal(t, int64(250), usd.Transfers.AverageSize)
	require.Equal(t, int64(600), usd.Transfers.Volume30d)
	require.Equal(t, int64(91_000), usd.Deposits.Volume)

	// A currency with transactions but no customer accounts still appears.
	require.Equal(t, "EUR", rsp.Currencies[1].Currency)
	require.Zero(t, rsp.Currencies[1].Accounts)
}

func TestAdminAccounts(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)
	store.EXPECT().GetUser(gomock.Any(), "root").Return(db.User{Username: "root", Role: RoleAdmin}, nil).Times(2)
	store.EXPECT().AdminListAccounts(gomock.Any(), db.AdminListAccountsParams{
		Owner:     sql.NullString{String: "ada", Valid: true},
		Status:    sql.NullString{String: "frozen", Valid: true},
		Sort:      "balance",
		PageLimit: 25,
	}).Return([]db.AdminListAccountsRow{{ID: 7, Owner: "ada"}}, nil)

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodGet, "/admin/accounts?page_id=1&page_size=25&owner=ada&status=frozen&sort=balance", nil, "root")
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	recorder = doJSON(t, server, http.MethodGet, "/admin/accounts?page_id=1&page_size=25&status=deleted", nil, "root")
	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestAdminTransactionsValidation(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)
	store.EXPECT().GetUser(gomock.Any(), "root").Return(db.User{Username: "root", Role: RoleAdmin}, nil)

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodGet, "/admin/transactions?page_id=1&page_size=10&kind=refund", nil, "root")
	require.Equal(t, http.StatusBadRequest, recorder.Code)
}
