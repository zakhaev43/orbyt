# Every target runs its tooling in Docker, so the only host requirements are
# make and Docker. Recipes are plain commands (no sh-isms) so they also work
# when make falls back to cmd.exe on Windows.

# Git Bash/MSYS would otherwise rewrite container paths like /src into
# C:/Program Files/Git/src before they reach docker. No effect elsewhere.
export MSYS_NO_PATHCONV := 1
export MSYS2_ARG_CONV_EXCL := *

# On Linux, containers run as root and would leave root-owned files in the
# checkout; generators run as the host user instead. Docker Desktop on
# Windows maps ownership itself, so this is skipped there.
ifneq ($(OS),Windows_NT)
HOST_USER := $(shell id -u):$(shell id -g)
AS_HOST_USER := -u $(HOST_USER)
endif

NETWORK     := orbyt_default
DB_URL      := postgresql://root:secret@postgres:5432/orbyt?sslmode=disable
TEST_DB_URL := postgresql://root:secret@postgres:5432/orbyt_test?sslmode=disable

GO_IMAGE      := golang:1.26.5-alpine3.24
NODE_IMAGE    := node:22-alpine
SQLC_IMAGE    := sqlc/sqlc:1.27.0
MIGRATE_IMAGE := migrate/migrate:v4.18.1

GO   := docker run --rm -v "$(CURDIR):/src" -w /src -v orbyt-gomod:/go/pkg/mod -v orbyt-gobuild:/root/.cache/go-build
NODE := docker run --rm -v "$(CURDIR)/web:/app" -w /app -v orbyt-web-nm:/app/node_modules
MIGRATE := docker run --rm --network $(NETWORK) -v "$(CURDIR)/db/migration:/migrations" $(MIGRATE_IMAGE) -path=/migrations -database "$(DB_URL)"

## Stack ---------------------------------------------------------------------

up: ## Build and start postgres, api and web
	docker compose up -d --build

down: ## Stop the stack
	docker compose down

ps: ## Show container status
	docker compose ps

logs: ## Follow api logs
	docker compose logs -f api

psql: ## Open a psql shell on the app database
	docker compose exec postgres psql -U root orbyt

## Database ------------------------------------------------------------------
## The api applies migrations itself on startup; these are for manual control.

migrateup:
	$(MIGRATE) up

migrateup1:
	$(MIGRATE) up 1

migratedown1:
	$(MIGRATE) down 1

migratedown: ## Roll back every migration (destroys all data)
	$(MIGRATE) down -all

## Demo data -----------------------------------------------------------------

USERS     ?= 40
TRANSFERS ?= 1500
DAYS      ?= 90

provision: ## Seed demo users, accounts and backdated transactions (USERS=, TRANSFERS=, DAYS=)
	docker compose up -d --wait postgres
	$(GO) --network $(NETWORK) -e DB_SOURCE="$(DB_URL)" $(GO_IMAGE) go run ./cmd/provision -users=$(USERS) -transfers=$(TRANSFERS) -days=$(DAYS)

# ADMIN rather than USERNAME: Windows always sets USERNAME in the environment.
promote: ## Make an existing user an admin (ADMIN=username)
	$(if $(ADMIN),,$(error usage: make promote ADMIN=username))
	docker compose exec -T postgres psql -U root orbyt -c "UPDATE users SET role = 'admin' WHERE username = '$(ADMIN)' RETURNING username, role"

## Backend -------------------------------------------------------------------

test: ## Run Go tests against a separate orbyt_test database
	docker compose up -d --wait postgres
	docker compose exec -T postgres sh -c "createdb -U root orbyt_test 2>/dev/null || true"
	$(GO) --network $(NETWORK) -e DB_SOURCE="$(TEST_DB_URL)" $(GO_IMAGE) go test -count=1 -cover ./...

vet:
	$(GO) $(GO_IMAGE) go vet ./...

fmt:
	$(GO) $(AS_HOST_USER) $(GO_IMAGE) gofmt -l -w .

sqlc: ## Regenerate db/sqlc from db/query
	docker run --rm $(AS_HOST_USER) -v "$(CURDIR):/src" -w /src $(SQLC_IMAGE) generate

# mockgen needs the root-owned module cache, so it runs as root and the
# output file is handed back to the host user afterwards on Linux.
mock: ## Regenerate db/mock from the Store interface
	$(GO) $(GO_IMAGE) sh -c "go run go.uber.org/mock/mockgen@v0.4.0 -package mockdb -destination db/mock/store.go github.com/zakhaev43/orbyt/db/sqlc Store $(if $(HOST_USER),&& chown $(HOST_USER) db/mock/store.go)"

## Frontend ------------------------------------------------------------------

web-install:
	$(NODE) $(NODE_IMAGE) npm ci --no-audit --no-fund

web-check: web-install ## Type-check and lint the web app
	$(NODE) $(NODE_IMAGE) sh -c "npx tsc --noEmit && npx eslint src"

.PHONY: up down ps logs psql migrateup migrateup1 migratedown1 migratedown provision promote test vet fmt sqlc mock web-install web-check
