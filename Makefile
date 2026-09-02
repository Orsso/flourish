UUID := flourish@orsso.github.io
SCHEMA_DIR := $(UUID)/schemas
DIST_DIR := dist
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: check lint test schema pack pot install clean

check: lint test schema

lint:
	./node_modules/.bin/eslint $(UUID) tests eslint.config.js

# St and Clutter typelibs ship outside the default search path. The memory
# backend keeps host settings such as reduce motion out of the tests.
test:
	paths="$$(ls -d /usr/lib*/gnome-shell /usr/lib*/mutter-* /usr/lib/*/gnome-shell /usr/lib/*/mutter-* 2>/dev/null | paste -sd:)"; \
	GSETTINGS_BACKEND=memory GI_TYPELIB_PATH="$$paths" LD_LIBRARY_PATH="$$paths" gjs -m tests/run.js
	bash tests/packageVerifier.test.sh

schema:
	glib-compile-schemas --strict --dry-run $(SCHEMA_DIR)

# gnome-extensions pack compiles po/*.po from this directory on its own.
pot:
	mkdir -p $(UUID)/po
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=N_ \
		--package-name='Flourish' \
		--output=$(UUID)/po/flourish.pot \
		$(UUID)/prefs.js $(UUID)/lib/prefs/*.js

pack: check
	mkdir -p $(DIST_DIR)
	gnome-extensions pack --force --out-dir=$(DIST_DIR) \
		--extra-source=lib \
		--extra-source=hover-background-hidden.css \
		--extra-source=focused-app-background-hidden.css \
		--extra-source=dash-hover-background-hidden.css \
		--extra-source=dash-focused-app-background.css \
		--extra-source=../README.md \
		--extra-source=../LICENSE \
		$(UUID)
	bash scripts/verify-package.sh $(DIST_DIR)/$(UUID).shell-extension.zip

install: pack
	gnome-extensions install --force $(DIST_DIR)/$(UUID).shell-extension.zip
	glib-compile-schemas $(INSTALL_DIR)/schemas

clean:
	rm -rf $(DIST_DIR) $(SCHEMA_DIR)/gschemas.compiled
