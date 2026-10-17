.DEFAULT_GOAL := help

help: ## list supported targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

docs: ## validate governance, document layers, and PRD/EARS structure
	@python3 scripts/check_governance.py
	@prds=$$(find docs/current/product docs/work/product -type f -name 'PRD-[0-9]*.md' -print 2>/dev/null); \
	if test -n "$$prds"; then python3 scripts/check_prd.py $$prds; fi

approve: ## move an approved draft into docs/current (DOC=docs/work/...)
	@python3 scripts/move_doc.py approve "$(DOC)"

close: ## move finished work into docs/records (DOC=docs/work/...)
	@python3 scripts/move_doc.py close "$(DOC)"

toolchain: ## check that node matches the .nvmrc pin (fix: nvm use)
	@want="v$$(cat .nvmrc)"; have="$$(node --version)"; \
	test "$$have" = "$$want" || { echo "toolchain: node $$have, .nvmrc pins $$want; run nvm use" >&2; exit 1; }

build: ## type-check and bundle main.js (npm run build)
	@npm run build

format: ## check tracked files for whitespace errors (no code formatter yet)
	@git diff --check $$(git hash-object -t tree /dev/null) --

lint: docs format ## governance docs, whitespace, then ESLint (npm run lint)
	@npm run lint

lint-fast: docs format ## fast advisory Stop-hook feedback
	@npm run lint

test: ## policy-script tests, then the node:test suite (npm test)
	@python3 -m unittest scripts/test_agentic_gates.py
	@npm test

verify: toolchain build lint test ## run the complete local and CI gate
	@echo "verify: OK (toolchain + build + docs + format + lint + tests)"

.PHONY: help docs approve close toolchain build format lint lint-fast test verify
