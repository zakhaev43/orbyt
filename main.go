package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/zakhaev43/orbyt/api"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/util"
)

func main() {

	config, err := util.LoadConfig(".")

	if err != nil {

		log.Fatal("cannot load config file:", err)
	}
	conn, err := sql.Open(config.DBDriver, config.DBSource)
	if err != nil {
		log.Fatal("cannot connect to db:", err)
	}
	if err := waitForDB(conn, 30*time.Second); err != nil {
		log.Fatal("database not reachable:", err)
	}

	store := db.NewStore(conn)
	fmt.Printf("The length of TokenSymmetricKey is: %d\n", len(config.TokenSymmetricKey))
	server, err := api.NewServer(config, store)

	if err != nil {
		log.Fatal("cant not create server\n", err)
	}
	//run migration
	runDBMigration(config.MigrationURL, config.DBSource)
	err = server.Start(config.ServerAddress)

	if err != nil {
		log.Fatal("cannot start server:", err)
	}

}

// waitForDB retries until the database accepts connections, so the API can
// start before Postgres has finished booting.
func waitForDB(conn *sql.DB, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		err := pingWithTimeout(conn, 2*time.Second)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return err
		}
		log.Println("waiting for database:", err)
		time.Sleep(time.Second)
	}
}

// lib/pq ignores the context while resolving the host, so an unresolvable
// hostname would block PingContext indefinitely; bound it ourselves.
func pingWithTimeout(conn *sql.DB, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	result := make(chan error, 1)
	go func() { result <- conn.PingContext(ctx) }()
	select {
	case err := <-result:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func runDBMigration(migrationURL string, dbSource string) {

	migration, err := migrate.New(migrationURL, dbSource)
	if err != nil {
		log.Fatal("could not create new migration instance:", err)
	}

	err = migration.Up()

	if err != nil && err != migrate.ErrNoChange {
		log.Fatalf("Migration failed: %v", err)
	}

	log.Println("db migrtaed successfully")

}
