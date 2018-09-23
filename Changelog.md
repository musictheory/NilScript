CHANGELOG

---

3.0.0

3.x is a backwards incompatible release, with a focus on simplifying the language and improving
syntax consistency.

This is the first major release under the new language name (NilScript); as such,
runtime APIs and generated code use "ns"/"NS"/"nilscript" rather than "oj"/"OJ".

Major Language Changes:
 - '@implementation' is now '@class' (#140)
 - Property and ivar syntax now uses TypeScript-style type annotations rather than C-style.
 - Removed `@squeeze` directive (#137)
 - Removed `@forward` directive (#138)
 - Removed C++ style syntax for '@cast' (#147)
 - Removed 'nonatomic' and 'atomic' property attributes (#148)
 - Removed 'assign', 'retain', 'strong', 'unsafe_unretained', and 'weak' property attributes (#148)
 - Removed 'nonnull', 'null_resettable', 'null_unspecified', and 'nullable' property attributes (#148)
 - Removed 'double', 'float', 'int', 'char', 'short', and 'long' types (#152)
 - Removed 'Bool' and 'bool' types (#152)

---

2.0.0

2.x is a backwards incompatible release, with a focus on improving the performance of incremental compiles
and modernizing the compiler architecture.

While there are breaking changes in the use of the compiler, generated code should still be compatible
with modern web browsers and environments.

Added:
  - New 'Compiler' API (#73)
  - New 'getRuntimePath()' API (#121)
  - ojc.symbolicate API for crash log symbolication (#75, #122)
  - "before-compile" and "after-compile" hooks for preprocessors/linters/transformers (#79, #97)
  - New 'warn-unknown-superclasses' option (#119)

Language Changes:
  - '@enum' and '@const' are always global and inlined (#103)
  - Removed '@struct' and '@typedef' in favor of '@type' (#105, #106)
  - Removed 'var _ivar' declaration syntax (#108)
  - Added 'struct' property attribute, fixed 'copy' property attribute (#94)
  - Added '@observe' property observers (#118)
  - Forward declarations now use `@forward` rather than `@class` (#120)

Breaking Changes:
  - node 6+ is now required to run ojc (#76, #117)
  - TypeScript updated to 2.0. See [Breaking Changes on the TypeScript Wiki](https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes).
  - 'include-state' compiler option is needed to include the 'state' key (#74)
  - 'runtime.js' is now located in the 'lib' directory (#72)
  - Removed JSHint integration (#78) in favor of a generic "after-compile" hook (#79)
  - Removed 'cache', 'jshint', 'jshint-config', 'jshint-ignore', and development `ojc` options
  - Removed support for legacy browsers (pre-ES5) (#77)
  - Code generation differences (#80)
  - 'typescript-lib' option changes (#109)

---

1.2.0
- Update to Esprima 2.7 (#38)
- Added @CLASS, @SEL, @FUNCTION for debugging (#58)
- @global functions (#68)
- Category (#55) and protocol (#57) support
- Throw errors when the compiler will generate invalid code (#60)
- Major changes to the typechecker (#64, #65, #71)

1.1.1 - 1.1.4
- Minor bug fixes and internal changes

1.1.0
- @each support #36

1.0.1
- Update to Esprima 1.2.2 #28
- Traverser's skip array causing 6% slowdown #29
- Add ability for typealias / typedef #30
- Classes can be superclasses of each other #23
- Dynamic property prevents synthesis of following properties #35
- @synthesize should always make a backing ivar #34
- Add documentation for $oj_oj #33
- Add 'temp' dependency #32
- Support protocols and typed arrays #31

---

1.0.0

1.x is a backwards incompatible release, with a focus on enhancing runtime performance.

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
  - Unique JavaScript symbol names for methods (#20)
  - Warn about unused ivars (#22)

Additions:

  - New `@const` and `@enum`
  - Integration of squeezer directly into ojc.  This allows more squeeze-time optimizations.
  - Documentation for runtime (#7)
  - Documentation for compiler API
  - Source map support (#13)
  - Support for jshint (#14)

Bug Fixes:

  - Duplicate @implementation of same class should throw error (#15)
  - (3.14 * [[self foo] bar]) results in NaN (#16)
  - Automatic synthesis of properties produces too many ivars (#19)
  - ivars that are @enum types should be initialized to 0. (#21)
