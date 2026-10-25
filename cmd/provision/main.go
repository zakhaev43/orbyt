// Command provision seeds a database with demo users, accounts and a few
// months of backdated transactions. Every movement goes through the same
// store functions the API uses, so the ledger stays balanced and verifiable.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand/v2"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/util"
)

type options struct {
	users         int
	transfers     int
	days          int
	seed          uint64
	password      string
	admin         string
	adminPassword string
}

func main() {
	var opts options
	flag.IntVar(&opts.users, "users", 40, "number of demo users to create")
	flag.IntVar(&opts.transfers, "transfers", 1500, "number of transfers between demo accounts")
	flag.IntVar(&opts.days, "days", 90, "spread activity over this many past days")
	flag.Uint64Var(&opts.seed, "seed", 0, "random seed (0 = random)")
	flag.StringVar(&opts.password, "password", "secret123", "password for every demo user")
	flag.StringVar(&opts.admin, "admin", "admin", "admin username to create or promote (empty to skip)")
	flag.StringVar(&opts.adminPassword, "admin-password", "admin12345", "password if the admin user is created")
	flag.Parse()

	if opts.users < 2 || opts.days < 1 || opts.transfers < 0 {
		log.Fatal("need -users >= 2, -days >= 1 and -transfers >= 0")
	}
	if opts.seed == 0 {
		opts.seed = uint64(time.Now().UnixNano())
	}

	config, err := util.LoadConfig(".")
	if err != nil {
		log.Fatal("cannot load config:", err)
	}
	conn, err := sql.Open(config.DBDriver, config.DBSource)
	if err != nil {
		log.Fatal("cannot connect to db:", err)
	}
	if err := db.WaitForDB(conn, 30*time.Second); err != nil {
		log.Fatal("database not reachable:", err)
	}
	if err := db.RunMigrations(config.MigrationURL, config.DBSource); err != nil {
		log.Fatal("migration failed:", err)
	}

	p := &provisioner{
		ctx:   context.Background(),
		conn:  conn,
		store: db.NewStore(conn),
		rng:   rand.New(rand.NewPCG(opts.seed, opts.seed^0x9e3779b97f4a7c15)),
		opts:  opts,
		end:   time.Now().Add(-time.Minute),
	}
	p.start = p.end.AddDate(0, 0, -opts.days)

	started := time.Now()
	if err := p.run(); err != nil {
		log.Fatal(err)
	}
	p.report(time.Since(started))
}

type demoAccount struct {
	db.Account
	openedAt time.Time
}

type provisioner struct {
	ctx        context.Context
	conn       *sql.DB
	store      db.Store
	rng        *rand.Rand
	opts       options
	start, end time.Time

	users     []db.User
	accounts  []*demoAccount
	deposits  int
	transfers int
	skipped   int
	frozen    int
}

func (p *provisioner) run() error {
	if p.opts.admin != "" {
		if err := p.ensureAdmin(); err != nil {
			return fmt.Errorf("admin: %w", err)
		}
	}
	if err := p.createUsers(); err != nil {
		return fmt.Errorf("users: %w", err)
	}
	if err := p.playTimeline(); err != nil {
		return fmt.Errorf("transactions: %w", err)
	}
	return p.freezeSome()
}

func (p *provisioner) ensureAdmin() error {
	_, err := p.store.GetUser(p.ctx, p.opts.admin)
	if errors.Is(err, sql.ErrNoRows) {
		hashed, err := util.HashPassword(p.opts.adminPassword)
		if err != nil {
			return err
		}
		if _, err := p.store.CreateUser(p.ctx, db.CreateUserParams{
			Username:       p.opts.admin,
			HashedPassword: hashed,
			FullName:       "Orbyt Admin",
			Email:          p.opts.admin + "@orbyt.example",
		}); err != nil {
			return err
		}
		log.Printf("created admin user %q", p.opts.admin)
	} else if err != nil {
		return err
	}
	_, err = p.store.SetUserRole(p.ctx, db.SetUserRoleParams{Username: p.opts.admin, Role: "admin"})
	return err
}

var (
	firstNames = []string{
		"Amara", "Liam", "Sofia", "Noah", "Aisha", "Mateo", "Yuki", "Ethan", "Priya", "Lucas",
		"Fatima", "Oliver", "Mei", "Elijah", "Zara", "Diego", "Hana", "Samuel", "Leila", "Arjun",
		"Chloe", "Kofi", "Ingrid", "Omar", "Nia", "Felix", "Rosa", "Tariq", "Elena", "Kenji",
		"Maya", "Jonas", "Ama", "Hugo", "Sana", "Ivan", "Lucia", "Ravi", "Freya", "Emeka",
	}
	lastNames = []string{
		"Okafor", "Lindqvist", "Garcia", "Nakamura", "Rahman", "Rossi", "Kim", "Novak", "Mensah", "Dubois",
		"Patel", "Schmidt", "Hassan", "Silva", "Kowalski", "Nguyen", "Ibrahim", "Moreau", "Haddad", "Larsen",
		"Chen", "Adeyemi", "Fischer", "Costa", "Ali", "Petrov", "Santos", "Murphy", "Tanaka", "Ahmed",
	}
	transferNotes = []string{
		"Rent", "Dinner", "Groceries", "Coffee", "Concert tickets", "Birthday gift", "Taxi", "Utilities",
		"Weekend trip", "Gym membership", "Lunch", "Movie night", "Books", "Phone bill", "Pizza",
		"Car share", "Flowers", "Football tickets", "Paying you back", "Holiday deposit", "", "", "",
	}
	depositNotes = []string{"Salary", "Top-up", "Freelance payment", "Refund", "Savings transfer"}

	// Rough mix of how many accounts are opened in each currency.
	currencyWeights = []struct {
		currency string
		weight   float64
	}{{util.USD, 0.45}, {util.EUR, 0.30}, {util.GBP, 0.15}, {util.CAD, 0.10}}
)

// timeAt maps a fraction of the window to a timestamp.
func (p *provisioner) timeAt(fraction float64) time.Time {
	span := p.end.Sub(p.start)
	return p.start.Add(time.Duration(fraction * float64(span)))
}

// moneyBetween returns a log-uniform amount in minor units, rounded to whole
// major units half the time so amounts look like real payments.
func (p *provisioner) moneyBetween(minMajor, maxMajor float64) int64 {
	major := math.Exp(math.Log(minMajor) + p.rng.Float64()*(math.Log(maxMajor)-math.Log(minMajor)))
	if p.rng.IntN(2) == 0 {
		return int64(math.Round(major)) * 100
	}
	return int64(math.Round(major * 100))
}

func (p *provisioner) pickCurrencies() []string {
	count := 1 + p.rng.IntN(3)
	chosen := map[string]bool{}
	for len(chosen) < count {
		r := p.rng.Float64()
		for _, cw := range currencyWeights {
			if r < cw.weight {
				chosen[cw.currency] = true
				break
			}
			r -= cw.weight
		}
	}
	// Keep USD/EUR/GBP/CAD ordering stable for reproducible seeds.
	var out []string
	for _, cw := range currencyWeights {
		if chosen[cw.currency] {
			out = append(out, cw.currency)
		}
	}
	return out
}

func (p *provisioner) createUsers() error {
	hashed, err := util.HashPassword(p.opts.password)
	if err != nil {
		return err
	}

	for len(p.users) < p.opts.users {
		first := firstNames[p.rng.IntN(len(firstNames))]
		last := lastNames[p.rng.IntN(len(lastNames))]
		username := strings.ToLower(first+last) + fmt.Sprint(100+p.rng.IntN(900))

		user, err := p.store.CreateUser(p.ctx, db.CreateUserParams{
			Username:       username,
			HashedPassword: hashed,
			FullName:       first + " " + last,
			Email:          username + "@example.com",
		})
		if err != nil {
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && pqErr.Code.Name() == "unique_violation" {
				continue
			}
			return err
		}

		// Sign-ups are spread over the first two thirds of the window.
		joined := p.timeAt(p.rng.Float64() * 0.66)
		if _, err := p.conn.ExecContext(p.ctx, "UPDATE users SET created_at = $1 WHERE username = $2", joined, user.Username); err != nil {
			return err
		}
		user.CreatedAt = joined
		p.users = append(p.users, user)

		for _, currency := range p.pickCurrencies() {
			account, err := p.store.CreateAccount(p.ctx, db.CreateAccountParams{Owner: user.Username, Currency: currency})
			if err != nil {
				return err
			}
			opened := joined.Add(time.Duration(p.rng.IntN(72)) * time.Hour)
			if opened.After(p.end) {
				opened = p.end.Add(-time.Hour)
			}
			if _, err := p.conn.ExecContext(p.ctx, "UPDATE accounts SET created_at = $1 WHERE id = $2", opened, account.ID); err != nil {
				return err
			}
			account.CreatedAt = opened
			p.accounts = append(p.accounts, &demoAccount{Account: account, openedAt: opened})
		}
	}
	log.Printf("created %d users with %d accounts", len(p.users), len(p.accounts))
	return nil
}

type event struct {
	at      time.Time
	deposit *demoAccount // nil means a random transfer
	initial bool
}

// playTimeline builds every event up front, sorts it by time and replays it,
// so entry ids and hash-chain order follow the backdated timestamps.
func (p *provisioner) playTimeline() error {
	var events []event
	for _, account := range p.accounts {
		events = append(events, event{at: account.openedAt.Add(time.Minute), deposit: account, initial: true})
		// Recurring income roughly every two to four weeks.
		for t := account.openedAt.Add(time.Duration(10+p.rng.IntN(20)) * 24 * time.Hour); t.Before(p.end); t = t.Add(time.Duration(14+p.rng.IntN(16)) * 24 * time.Hour) {
			events = append(events, event{at: t, deposit: account})
		}
	}
	for i := 0; i < p.opts.transfers; i++ {
		// sqrt skews activity toward recent days, like a growing product.
		events = append(events, event{at: p.timeAt(math.Sqrt(p.rng.Float64()))})
	}
	sort.Slice(events, func(i, j int) bool { return events[i].at.Before(events[j].at) })

	for i, ev := range events {
		var err error
		if ev.deposit != nil {
			err = p.deposit(ev)
		} else {
			err = p.transfer(ev.at)
		}
		if err != nil {
			return err
		}
		if (i+1)%500 == 0 {
			log.Printf("  %d/%d events", i+1, len(events))
		}
	}
	return nil
}

func (p *provisioner) deposit(ev event) error {
	amount := p.moneyBetween(150, 2500)
	note := depositNotes[p.rng.IntN(len(depositNotes))]
	if ev.initial {
		amount = p.moneyBetween(500, 6000)
		note = "Initial top-up"
	}
	result, err := p.store.DepositTx(p.ctx, db.DepositTxParams{
		AccountID:   ev.deposit.ID,
		Amount:      amount,
		Description: note,
		At:          ev.at,
	})
	if err != nil {
		return err
	}
	ev.deposit.Balance = result.Account.Balance
	p.deposits++
	return nil
}

func (p *provisioner) transfer(at time.Time) error {
	const minBalance = 500 // 5.00 in minor units

	var senders []*demoAccount
	for _, a := range p.accounts {
		if !a.openedAt.After(at) && a.Balance >= minBalance {
			senders = append(senders, a)
		}
	}
	if len(senders) == 0 {
		p.skipped++
		return nil
	}
	from := senders[p.rng.IntN(len(senders))]

	var recipients []*demoAccount
	for _, a := range p.accounts {
		if a.Currency == from.Currency && a.Owner != from.Owner && !a.openedAt.After(at) {
			recipients = append(recipients, a)
		}
	}
	if len(recipients) == 0 {
		p.skipped++
		return nil
	}
	to := recipients[p.rng.IntN(len(recipients))]

	limit := float64(from.Balance) / 100 * 0.35
	amount := p.moneyBetween(3, math.Max(limit, 3.5))
	if amount > from.Balance {
		amount = from.Balance
	}

	result, err := p.store.TransferTx(p.ctx, db.TransferTxParams{
		FromAccountID: from.ID,
		ToAccountID:   to.ID,
		Amount:        amount,
		Currency:      from.Currency,
		Description:   transferNotes[p.rng.IntN(len(transferNotes))],
		At:            at,
	})
	if err != nil {
		return err
	}
	from.Balance = result.FromAccount.Balance
	to.Balance = result.ToAccount.Balance
	p.transfers++
	return nil
}

// freezeSome freezes about 3% of accounts so the admin views have variety.
func (p *provisioner) freezeSome() error {
	for _, a := range p.accounts {
		if p.rng.Float64() >= 0.03 {
			continue
		}
		if _, err := p.store.UpdateAccountStatus(p.ctx, db.UpdateAccountStatusParams{
			ID: a.ID, Owner: a.Owner, FromStatus: db.AccountStatusActive, NewStatus: db.AccountStatusFrozen,
		}); err != nil {
			return err
		}
		p.frozen++
	}
	return nil
}

func (p *provisioner) report(elapsed time.Duration) {
	report, err := p.store.VerifyLedger(p.ctx)
	status := "verified"
	if err != nil {
		status = "check failed: " + err.Error()
	} else if !report.Valid() {
		status = fmt.Sprintf("INVALID (chain=%v, balance mismatches=%d, unbalanced=%d)",
			report.ChainValid, len(report.BalanceMismatches), len(report.UnbalancedTransactions))
	}

	fmt.Println()
	fmt.Println("Provisioning complete in", elapsed.Round(time.Millisecond))
	fmt.Printf("  users:      %d (password %q)\n", len(p.users), p.opts.password)
	fmt.Printf("  accounts:   %d (%d frozen)\n", len(p.accounts), p.frozen)
	fmt.Printf("  deposits:   %d\n", p.deposits)
	fmt.Printf("  transfers:  %d (%d skipped for lack of funds or recipients)\n", p.transfers, p.skipped)
	fmt.Printf("  period:     %s to %s\n", p.start.Format("2006-01-02"), p.end.Format("2006-01-02"))
	fmt.Printf("  ledger:     %s\n", status)
	if len(p.users) > 0 {
		fmt.Printf("  try:        log in as %q / %q\n", p.users[0].Username, p.opts.password)
	}
	if p.opts.admin != "" {
		fmt.Printf("  admin:      %q (password %q if it was just created)\n", p.opts.admin, p.opts.adminPassword)
	}
}
