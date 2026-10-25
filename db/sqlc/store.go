package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/lib/pq"
	"github.com/zakhaev43/orbyt/util"
)

const (
	AccountStatusActive = "active"
	AccountStatusFrozen = "frozen"
	AccountStatusClosed = "closed"

	AccountKindCustomer = "customer"
	AccountKindSystem   = "system"

	TransactionKindTransfer = "transfer"
	TransactionKindDeposit  = "deposit"
)

var (
	ErrInsufficientFunds   = errors.New("insufficient funds")
	ErrAccountNotActive    = errors.New("account is not active")
	ErrCurrencyMismatch    = errors.New("currency mismatch")
	ErrSameAccount         = errors.New("cannot transfer to the same account")
	ErrInvalidCounterparty = errors.New("transfers are only possible between customer accounts")
)

// AccountStateError reports which account blocked a posting and why.
type AccountStateError struct {
	AccountID int64
	Status    string
}

func (e *AccountStateError) Error() string {
	return fmt.Sprintf("account %d is %s", e.AccountID, e.Status)
}

func (e *AccountStateError) Unwrap() error { return ErrAccountNotActive }

// Store defines all functions to execute db queries and transactions
type Store interface {
	Querier
	TransferTx(ctx context.Context, arg TransferTxParams) (TransferTxResult, error)
	DepositTx(ctx context.Context, arg DepositTxParams) (DepositTxResult, error)
	VerifyLedger(ctx context.Context) (LedgerReport, error)
	AppendAuditLog(ctx context.Context, key []byte, event AuditEvent) (AuditLog, error)
	VerifyAuditLog(ctx context.Context, key []byte) (AuditReport, error)
}

// SQLStore provides all functions to execute SQL queries and transactions
type SQLStore struct {
	db *sql.DB
	*Queries
}

// NewStore creates a new store
func NewStore(db *sql.DB) Store {
	return &SQLStore{
		db:      db,
		Queries: New(db),
	}
}

const maxTxAttempts = 25

// execTx runs fn in a SERIALIZABLE transaction, retrying on serialization
// failures and deadlocks — including those Postgres only detects at COMMIT.
func (store *SQLStore) execTx(ctx context.Context, fn func(*Queries) error) error {
	var lastErr error
	for attempt := 0; attempt < maxTxAttempts; attempt++ {
		if attempt > 0 {
			if err := backoff(ctx, attempt); err != nil {
				return err
			}
		}

		tx, err := store.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
		if err != nil {
			return err
		}

		if err = fn(New(tx)); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				return fmt.Errorf("tx err: %v, rb err: %v", err, rbErr)
			}
			if isRetryable(err) {
				lastErr = err
				continue
			}
			return err
		}

		if err = tx.Commit(); err != nil {
			if isRetryable(err) {
				lastErr = err
				continue
			}
			return err
		}
		return nil
	}
	return fmt.Errorf("transaction failed after %d attempts: %w", maxTxAttempts, lastErr)
}

func isRetryable(err error) bool {
	var pqErr *pq.Error
	if !errors.As(err, &pqErr) {
		return false
	}
	switch pqErr.Code {
	case "40001", "40P01": // serialization_failure, deadlock_detected
		return true
	}
	return false
}

func backoff(ctx context.Context, attempt int) error {
	base := time.Duration(attempt) * 2 * time.Millisecond
	wait := base + time.Duration(rand.Int63n(int64(base)+1))
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(wait):
		return nil
	}
}

// lockAccounts takes row locks in ascending ID order. Every money-moving
// transaction goes through here, so two transfers touching the same pair of
// accounts in opposite directions can never wait on each other in a cycle.
func lockAccounts(ctx context.Context, q *Queries, idA, idB int64) (Account, Account, error) {
	first, second := idA, idB
	if second < first {
		first, second = second, first
	}

	lockedFirst, err := q.GetAccountForUpdate(ctx, first)
	if err != nil {
		return Account{}, Account{}, err
	}
	lockedSecond, err := q.GetAccountForUpdate(ctx, second)
	if err != nil {
		return Account{}, Account{}, err
	}

	if lockedFirst.ID == idA {
		return lockedFirst, lockedSecond, nil
	}
	return lockedSecond, lockedFirst, nil
}

func requireActive(account Account) error {
	if account.Status != AccountStatusActive {
		return &AccountStateError{AccountID: account.ID, Status: account.Status}
	}
	return nil
}

type posting struct {
	accountID int64
	amount    int64
}

// postEntries appends one hash-chained ledger entry per posting and applies
// each amount to the account's cached balance. Postings must sum to zero; the
// entries_balanced trigger rejects the commit otherwise.
func postEntries(ctx context.Context, q *Queries, transactionID int64, at sql.NullTime, postings []posting) ([]Entry, map[int64]Account, error) {
	prevHash, err := q.GetLastEntryHash(ctx)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, nil, err
	}

	entries := make([]Entry, 0, len(postings))
	for _, p := range postings {
		entry, err := q.CreateEntry(ctx, CreateEntryParams{
			AccountID:     p.accountID,
			Amount:        p.amount,
			TransactionID: sql.NullInt64{Int64: transactionID, Valid: true},
			CreatedAt:     at,
		})
		if err != nil {
			return nil, nil, err
		}

		hash := util.ChainHash(prevHash, entry.ID, entry.AccountID, entry.Amount, entry.CreatedAt)
		entry, err = q.SetEntryHash(ctx, SetEntryHashParams{ID: entry.ID, PrevHash: prevHash, Hash: hash})
		if err != nil {
			return nil, nil, err
		}
		entries = append(entries, entry)
		prevHash = hash
	}

	accounts := make(map[int64]Account, len(postings))
	for _, p := range postings {
		account, err := q.AddAccountBalance(ctx, AddAccountBalanceParams{ID: p.accountID, Amount: p.amount})
		if err != nil {
			return nil, nil, err
		}
		accounts[account.ID] = account
	}

	return entries, accounts, nil
}

// TransferTxParams contains the input parameters of the transfer transaction
type TransferTxParams struct {
	FromAccountID int64  `json:"from_account_id"`
	ToAccountID   int64  `json:"to_account_id"`
	Amount        int64  `json:"amount"`
	Currency      string `json:"currency"`
	Description   string `json:"description"`
	// At backdates the transaction (used only for seeding demo data); the
	// zero value means "now", taken from the database clock.
	At time.Time `json:"-"`
}

// optionalTime maps the zero time to NULL so the database default applies.
func optionalTime(t time.Time) sql.NullTime {
	return sql.NullTime{Time: t, Valid: !t.IsZero()}
}

// TransferTxResult is the result of the transfer transaction
type TransferTxResult struct {
	Transaction Transaction `json:"transaction"`
	Transfer    Transfer    `json:"transfer"`
	FromAccount Account     `json:"from_account"`
	ToAccount   Account     `json:"to_account"`
	FromEntry   Entry       `json:"from_entry"`
	ToEntry     Entry       `json:"to_entry"`
}

// TransferTx moves money between two customer accounts as one balanced
// ledger transaction. Status, currency and funds are checked while both
// account rows are locked, so the checks can't go stale before the write.
func (store *SQLStore) TransferTx(ctx context.Context, arg TransferTxParams) (TransferTxResult, error) {
	var result TransferTxResult

	if arg.FromAccountID == arg.ToAccountID {
		return result, ErrSameAccount
	}
	if arg.Amount <= 0 {
		return result, fmt.Errorf("amount must be positive, got %d", arg.Amount)
	}

	err := store.execTx(ctx, func(q *Queries) error {
		from, to, err := lockAccounts(ctx, q, arg.FromAccountID, arg.ToAccountID)
		if err != nil {
			return err
		}

		if from.Kind != AccountKindCustomer || to.Kind != AccountKindCustomer {
			return ErrInvalidCounterparty
		}
		if err := requireActive(from); err != nil {
			return err
		}
		if err := requireActive(to); err != nil {
			return err
		}
		if from.Currency != arg.Currency || to.Currency != arg.Currency {
			return ErrCurrencyMismatch
		}
		if from.Balance < arg.Amount {
			return ErrInsufficientFunds
		}

		at := optionalTime(arg.At)
		result.Transaction, err = q.CreateTransaction(ctx, CreateTransactionParams{
			Kind:        TransactionKindTransfer,
			Currency:    arg.Currency,
			Amount:      arg.Amount,
			Description: arg.Description,
			CreatedAt:   at,
		})
		if err != nil {
			return err
		}

		result.Transfer, err = q.CreateTransfer(ctx, CreateTransferParams{
			FromAccountID: from.ID,
			ToAccountID:   to.ID,
			Amount:        arg.Amount,
			TransactionID: sql.NullInt64{Int64: result.Transaction.ID, Valid: true},
			CreatedAt:     at,
		})
		if err != nil {
			return err
		}

		entries, accounts, err := postEntries(ctx, q, result.Transaction.ID, at, []posting{
			{accountID: from.ID, amount: -arg.Amount},
			{accountID: to.ID, amount: arg.Amount},
		})
		if err != nil {
			return err
		}

		result.FromEntry, result.ToEntry = entries[0], entries[1]
		result.FromAccount, result.ToAccount = accounts[from.ID], accounts[to.ID]
		return nil
	})

	return result, err
}

// DepositTxParams contains the input parameters of the deposit transaction
type DepositTxParams struct {
	AccountID   int64  `json:"account_id"`
	Amount      int64  `json:"amount"`
	Description string `json:"description"`
	// At backdates the deposit; see TransferTxParams.At.
	At time.Time `json:"-"`
}

// DepositTxResult is the result of the deposit transaction
type DepositTxResult struct {
	Transaction Transaction `json:"transaction"`
	Account     Account     `json:"account"`
	Entry       Entry       `json:"entry"`
}

// DepositTx funds a customer account from the system account for its
// currency, so money entering the system is still a balanced transaction.
func (store *SQLStore) DepositTx(ctx context.Context, arg DepositTxParams) (DepositTxResult, error) {
	var result DepositTxResult

	if arg.Amount <= 0 {
		return result, fmt.Errorf("amount must be positive, got %d", arg.Amount)
	}

	err := store.execTx(ctx, func(q *Queries) error {
		target, err := q.GetAccount(ctx, arg.AccountID)
		if err != nil {
			return err
		}
		if target.Kind != AccountKindCustomer {
			return fmt.Errorf("cannot deposit into %s account %d", target.Kind, target.ID)
		}

		treasury, err := q.GetSystemAccount(ctx, target.Currency)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf("no system account for currency %s", target.Currency)
			}
			return err
		}

		account, _, err := lockAccounts(ctx, q, target.ID, treasury.ID)
		if err != nil {
			return err
		}
		if err := requireActive(account); err != nil {
			return err
		}

		at := optionalTime(arg.At)
		result.Transaction, err = q.CreateTransaction(ctx, CreateTransactionParams{
			Kind:        TransactionKindDeposit,
			Currency:    account.Currency,
			Amount:      arg.Amount,
			Description: arg.Description,
			CreatedAt:   at,
		})
		if err != nil {
			return err
		}

		entries, accounts, err := postEntries(ctx, q, result.Transaction.ID, at, []posting{
			{accountID: treasury.ID, amount: -arg.Amount},
			{accountID: account.ID, amount: arg.Amount},
		})
		if err != nil {
			return err
		}

		result.Entry = entries[1]
		result.Account = accounts[account.ID]
		return nil
	})

	return result, err
}

// LedgerReport is the outcome of a full ledger audit.
type LedgerReport struct {
	ChainValid             bool                            `json:"chain_valid"`
	BrokenEntryID          int64                           `json:"broken_entry_id,omitempty"`
	BalanceMismatches      []ListBalanceMismatchesRow      `json:"balance_mismatches"`
	UnbalancedTransactions []ListUnbalancedTransactionsRow `json:"unbalanced_transactions"`
	EntriesChecked         int                             `json:"entries_checked"`
}

// Valid reports whether every check in the audit passed.
func (r LedgerReport) Valid() bool {
	return r.ChainValid && len(r.BalanceMismatches) == 0 && len(r.UnbalancedTransactions) == 0
}

// VerifyLedger audits the ledger three ways: the entry hash chain is intact,
// every cached account balance equals the sum of its entries, and every
// transaction's entries sum to zero.
func (store *SQLStore) VerifyLedger(ctx context.Context) (LedgerReport, error) {
	var report LedgerReport

	entries, err := store.ListAllEntries(ctx)
	if err != nil {
		return report, err
	}
	report.EntriesChecked = len(entries)
	report.ChainValid = true

	prevHash := util.GenesisHash
	for _, entry := range entries {
		expectedHash := util.ChainHash(prevHash, entry.ID, entry.AccountID, entry.Amount, entry.CreatedAt)
		if entry.PrevHash != prevHash || entry.Hash != expectedHash {
			report.ChainValid = false
			report.BrokenEntryID = entry.ID
			break
		}
		prevHash = entry.Hash
	}

	if report.BalanceMismatches, err = store.ListBalanceMismatches(ctx); err != nil {
		return report, err
	}
	if report.UnbalancedTransactions, err = store.ListUnbalancedTransactions(ctx); err != nil {
		return report, err
	}

	return report, nil
}
