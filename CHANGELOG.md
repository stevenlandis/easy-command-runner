# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes

- Change `Cmd.run()` to not use `process.stdin` by default as input.
- Remove `Cmd.runDebug()` since it is now identical to `Cmd.run()`.

### Added

- Add `cmd.stdin()`, a source if users want to explicitly opt-in to passing `process.stdin` into their command.

## [0.0.1] - 2022-09-17

### Breaking Changes

- Remove stderr from `CmdErr` to prevent accidentally capturing stderr when not needed.

### Added

- Add `Cmd.runSilent()` to run commands without stdin, stdout or stderr.
- Add `Cmd.getAll()` to capture stdout and stderr as strings.
- Add `Cmd.runDebug()` to run commands and forward stdout + stderr.
- Add `CmdError.command` to more easily see which command failed.

## [0.0.0] - 2022-09-08

### Added

- Initial implementations for `cmd`, `cmd.file` and `cmd.text`
- A few tests to cover basic functionality
- Build commands
