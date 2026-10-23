postgres:
	docker run --name postgres12  -p 5432:5432 -e POSTGRES_USER=root -e POSTGRES_PASSWORD=secret -d postgres:12-alpine

mysql:
	docker run --name mysql8 -p 3306:3306  -e MYSQL_ROOT_PASSWORD=secret -d mysql:8

createdb:
	docker exec -it postgres createdb --username=root --owner=root orbyt

dropdb:
	docker exec -it postgres dropdb orbyt

migrateup:
	migrate -path db/migration -database "postgresql://root:secret@localhost:5432/orbyt?sslmode=disable" -verbose up

migrateup1:
	migrate -path db/migration -database "postgresql://root:secret@localhost:5432/orbyt?sslmode=disable" -verbose up 1

migratedown:
	migrate -path db/migration -database "postgresql://root:secret@localhost:5432/orbyt?sslmode=disable" -verbose down

migratedown1:
	migrate -path db/migration -database "postgresql://root:secret@localhost:5432/orbyt?sslmode=disable" -verbose down 1

sqlc:
	sqlc generate

test:
	go test -v -cover ./...

server:
	go run main.go

web:
	cd web && npm run dev

## Full stack, fully Dockerized (postgres + api + web) — production-like
up:
	docker compose up -d --build

## Stop the fully Dockerized stack
down:
	docker compose down

## Dev mode — only postgres runs in Docker; api (go run) and web (npm run dev)
## run locally with hot reload. Logs go to .dev/*.log.
## Each process starts in its own session (setsid) so dev-down can kill the
## whole process group, not just the top-level PID — plain `kill` on
## `go run`/`npm run dev` leaves their actual child process running.
dev-up:
	docker compose up -d postgres
	@mkdir -p .dev
	@echo "postgres: running in Docker (localhost:5432)"
	setsid sh -c 'exec go run main.go > .dev/api.log 2>&1' & echo $$! > .dev/api.pid
	@echo "api: started locally on :8080 (log: .dev/api.log, pid: .dev/api.pid)"
	cd web && setsid sh -c 'exec npm run dev > ../.dev/web.log 2>&1' & echo $$! > .dev/web.pid
	@echo "web: started locally on :3000 (log: .dev/web.log, pid: .dev/web.pid)"

## Stop dev mode — kills the locally-started api/web process groups and stops postgres
dev-down:
	@if [ -f .dev/api.pid ]; then kill -- -$$(cat .dev/api.pid) 2>/dev/null || true; rm -f .dev/api.pid; fi
	@if [ -f .dev/web.pid ]; then kill -- -$$(cat .dev/web.pid) 2>/dev/null || true; rm -f .dev/web.pid; fi
	docker compose stop postgres
	@echo "dev mode stopped"

.PHONY: postgres createdb dropdb migrateup migrateup1 migratedown migratedown1 sqlc test server web up down dev dev-down