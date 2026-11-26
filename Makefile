.PHONY: dev dev-down up down logs check-web check-service image backup verify-backup

dev:
	docker compose -f compose.dev.yaml up --build

dev-down:
	docker compose -f compose.dev.yaml down

up:
	docker compose up --build -d --wait

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

check-web:
	cd web && npm ci && npm run lint && npm run build

check-service:
	cd service && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings && cargo test --locked

image:
	docker build --target runtime -t mtl-minted:local .

backup:
	./deploy/backup.sh

verify-backup:
	@test -n "$(BACKUP)" || (echo 'Usage: make verify-backup BACKUP=/path/to/backup.tgz'; exit 1)
	python3 deploy/verify_backup.py "$(BACKUP)"
