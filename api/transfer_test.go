package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	mockdb "github.com/zakhaev43/Swift-Transfer/db/mock"
	db "github.com/zakhaev43/Swift-Transfer/db/sqlc"
	"github.com/zakhaev43/Swift-Transfer/util"
	"go.uber.org/mock/gomock"
)

func randomAccount(owner, currency string) db.Account {
	return db.Account{
		ID:       util.RandomInt(1, 1000),
		Owner:    owner,
		Balance:  util.RandomInt(100, 1000),
		Currency: currency,
		Status:   db.AccountStatusActive,
		Kind:     db.AccountKindCustomer,
	}
}

func doJSON(t *testing.T, server *Server, method, url string, body any, username string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		require.NoError(t, json.NewEncoder(&buf).Encode(body))
	}
	request, err := http.NewRequest(method, url, &buf)
	require.NoError(t, err)
	if username != "" {
		addAuthorization(t, request, server.tokenMaker, authorizationTypeBearer, username, time.Minute)
	}
	recorder := httptest.NewRecorder()
	server.router.ServeHTTP(recorder, request)
	return recorder
}

func TestCreateTransferAPI(t *testing.T) {
	sender := randomAccount("alice", util.USD)
	recipient := randomAccount("bob", util.USD)
	recipient.ID = sender.ID + 1
	amount := int64(10)

	validBody := map[string]any{
		"from_account_id": sender.ID,
		"to_account_id":   recipient.ID,
		"amount":          amount,
		"currency":        util.USD,
	}

	testCases := []struct {
		name       string
		body       map[string]any
		username   string
		buildStubs func(store *mockdb.MockStore)
		wantStatus int
		check      func(t *testing.T, recorder *httptest.ResponseRecorder)
	}{
		{
			name:     "OK",
			body:     validBody,
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), sender.ID).Return(sender, nil)
				store.EXPECT().TransferTx(gomock.Any(), db.TransferTxParams{
					FromAccountID: sender.ID, ToAccountID: recipient.ID, Amount: amount, Currency: util.USD,
				}).Return(db.TransferTxResult{FromAccount: sender, ToAccount: recipient}, nil)
			},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var rsp map[string]any
				require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &rsp))
				require.Contains(t, rsp, "from_account")
				require.NotContains(t, rsp, "to_account", "recipient balance must not leak to the sender")
			},
		},
		{
			name:       "Unauthenticated",
			body:       validBody,
			buildStubs: func(store *mockdb.MockStore) {},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:     "NotOwner",
			body:     validBody,
			username: "mallory",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), sender.ID).Return(sender, nil)
				store.EXPECT().TransferTx(gomock.Any(), gomock.Any()).Times(0)
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:     "SenderNotFound",
			body:     validBody,
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), sender.ID).Return(db.Account{}, sql.ErrNoRows)
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name:     "InsufficientFunds",
			body:     validBody,
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), sender.ID).Return(sender, nil)
				store.EXPECT().TransferTx(gomock.Any(), gomock.Any()).Return(db.TransferTxResult{}, db.ErrInsufficientFunds)
			},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:     "RecipientFrozen",
			body:     validBody,
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), sender.ID).Return(sender, nil)
				store.EXPECT().TransferTx(gomock.Any(), gomock.Any()).
					Return(db.TransferTxResult{}, &db.AccountStateError{AccountID: recipient.ID, Status: db.AccountStatusFrozen})
			},
			wantStatus: http.StatusConflict,
		},
		{
			name:     "CurrencyMismatch",
			body:     validBody,
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), sender.ID).Return(sender, nil)
				store.EXPECT().TransferTx(gomock.Any(), gomock.Any()).Return(db.TransferTxResult{}, db.ErrCurrencyMismatch)
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:     "RecipientNotFound",
			body:     validBody,
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), sender.ID).Return(sender, nil)
				store.EXPECT().TransferTx(gomock.Any(), gomock.Any()).Return(db.TransferTxResult{}, sql.ErrNoRows)
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name: "UnsupportedCurrency",
			body: map[string]any{
				"from_account_id": sender.ID, "to_account_id": recipient.ID, "amount": amount, "currency": "XYZ",
			},
			username:   "alice",
			buildStubs: func(store *mockdb.MockStore) {},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "SameAccount",
			body: map[string]any{
				"from_account_id": sender.ID, "to_account_id": sender.ID, "amount": amount, "currency": util.USD,
			},
			username:   "alice",
			buildStubs: func(store *mockdb.MockStore) {},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "NonPositiveAmount",
			body: map[string]any{
				"from_account_id": sender.ID, "to_account_id": recipient.ID, "amount": -5, "currency": util.USD,
			},
			username:   "alice",
			buildStubs: func(store *mockdb.MockStore) {},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			store := mockdb.NewMockStore(ctrl)
			tc.buildStubs(store)

			server := newTestServer(t, store)
			recorder := doJSON(t, server, http.MethodPost, "/transfers", tc.body, tc.username)
			require.Equal(t, tc.wantStatus, recorder.Code, recorder.Body.String())
			if tc.check != nil {
				tc.check(t, recorder)
			}
		})
	}
}

func TestAccountStatusAPI(t *testing.T) {
	active := randomAccount("alice", util.EUR)
	active.Balance = 0

	frozen := active
	frozen.Status = db.AccountStatusFrozen

	funded := active
	funded.Balance = 500

	testCases := []struct {
		name       string
		action     string
		username   string
		buildStubs func(store *mockdb.MockStore)
		wantStatus int
	}{
		{
			name:     "FreezeOK",
			action:   "freeze",
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), active.ID).Return(active, nil)
				store.EXPECT().UpdateAccountStatus(gomock.Any(), db.UpdateAccountStatusParams{
					ID: active.ID, Owner: "alice", FromStatus: db.AccountStatusActive, NewStatus: db.AccountStatusFrozen,
				}).Return(frozen, nil)
			},
			wantStatus: http.StatusOK,
		},
		{
			name:     "FreezeAlreadyFrozen",
			action:   "freeze",
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), active.ID).Return(frozen, nil)
				store.EXPECT().UpdateAccountStatus(gomock.Any(), gomock.Any()).Times(0)
			},
			wantStatus: http.StatusConflict,
		},
		{
			name:     "UnfreezeOK",
			action:   "unfreeze",
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), active.ID).Return(frozen, nil)
				store.EXPECT().UpdateAccountStatus(gomock.Any(), gomock.Any()).Return(active, nil)
			},
			wantStatus: http.StatusOK,
		},
		{
			name:     "CloseWithBalance",
			action:   "close",
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), active.ID).Return(funded, nil)
				store.EXPECT().UpdateAccountStatus(gomock.Any(), gomock.Any()).Times(0)
			},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:     "CloseRaceLost",
			action:   "close",
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), active.ID).Return(active, nil)
				store.EXPECT().UpdateAccountStatus(gomock.Any(), gomock.Any()).Return(db.Account{}, sql.ErrNoRows)
			},
			wantStatus: http.StatusConflict,
		},
		{
			name:     "NotOwner",
			action:   "freeze",
			username: "mallory",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), active.ID).Return(active, nil)
				store.EXPECT().UpdateAccountStatus(gomock.Any(), gomock.Any()).Times(0)
			},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			store := mockdb.NewMockStore(ctrl)
			tc.buildStubs(store)

			server := newTestServer(t, store)
			url := fmt.Sprintf("/accounts/%d/%s", active.ID, tc.action)
			recorder := doJSON(t, server, http.MethodPost, url, nil, tc.username)
			require.Equal(t, tc.wantStatus, recorder.Code, recorder.Body.String())
		})
	}
}

func TestCreateDepositAPI(t *testing.T) {
	account := randomAccount("alice", util.GBP)

	testCases := []struct {
		name       string
		body       map[string]any
		username   string
		buildStubs func(store *mockdb.MockStore)
		wantStatus int
	}{
		{
			name:     "OK",
			body:     map[string]any{"amount": 2500},
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), account.ID).Return(account, nil)
				store.EXPECT().DepositTx(gomock.Any(), db.DepositTxParams{
					AccountID: account.ID, Amount: 2500, Description: "Top-up",
				}).Return(db.DepositTxResult{Account: account}, nil)
			},
			wantStatus: http.StatusOK,
		},
		{
			name:     "NotOwner",
			body:     map[string]any{"amount": 2500},
			username: "mallory",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), account.ID).Return(account, nil)
				store.EXPECT().DepositTx(gomock.Any(), gomock.Any()).Times(0)
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "TooLarge",
			body:       map[string]any{"amount": 1_000_000_001},
			username:   "alice",
			buildStubs: func(store *mockdb.MockStore) {},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:     "FrozenAccount",
			body:     map[string]any{"amount": 100},
			username: "alice",
			buildStubs: func(store *mockdb.MockStore) {
				store.EXPECT().GetAccount(gomock.Any(), account.ID).Return(account, nil)
				store.EXPECT().DepositTx(gomock.Any(), gomock.Any()).
					Return(db.DepositTxResult{}, &db.AccountStateError{AccountID: account.ID, Status: db.AccountStatusFrozen})
			},
			wantStatus: http.StatusConflict,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			store := mockdb.NewMockStore(ctrl)
			tc.buildStubs(store)

			server := newTestServer(t, store)
			url := fmt.Sprintf("/accounts/%d/deposits", account.ID)
			recorder := doJSON(t, server, http.MethodPost, url, tc.body, tc.username)
			require.Equal(t, tc.wantStatus, recorder.Code, recorder.Body.String())
		})
	}
}

func TestMaskName(t *testing.T) {
	require.Equal(t, "Ada L.", maskName("Ada Lovelace"))
	require.Equal(t, "Ada L.", maskName("  Ada  King Lovelace "))
	require.Equal(t, "Cher", maskName("Cher"))
	require.Equal(t, "", maskName("   "))
}
