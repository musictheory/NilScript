CHANGELOG

## 1.0

This is a tentative list of the changes for 1.0.

Removed:

  - Removed separate `ojsqueeze` command-line tool.  The squeezer is now integrated directly into `ojc` (#8)
  - Removed `+initialize` and `+load`.  This allows faster message dispatch.  (#12)
  - Removed `--use-const` and `--use-enum` compiler flags.  Use the new `@const` and `@enum` instead (#11) 
  - Removed `--use-prefix` compiler flag.  Prefixes are always used.  (#6)
  - Removed `--always-message` compiler flag.  Replaced with `--debug-message-send`.

Enhancements:

  - Faster message dispatch:  Direct calls are used more often than `oj.msgSend` (#10)
  - Inline `+[Foo alloc]` calls as `new Foo()`
  - Updated parser to Esprima 1.1 (#9)

Additions:

  - Integration of squeezer directly into ojc.  This allows more squeeze-time optimizations.
  - Documentation for runtime (#7)
  - Source map support (#13) (Planned)
  - Add support for jshint (#14) (Planned)

