/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/lib"],
  testMatch: ["**/*.test.ts"],

  // Transform both our TypeScript source files AND the ESM-only @noble packages.
  // By default ts-jest only handles .ts/.tsx; adding the .[tj]sx? pattern with
  // allowJs lets it compile the @noble .js ESM files down to CommonJS as well.
  transform: {
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        tsconfig: {
          allowJs: true,
          target: "ES2020",
          module: "CommonJS",
          moduleResolution: "node",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },

  // By default Jest skips transforming everything inside node_modules.
  // We need to transform @noble/secp256k1 and @noble/hashes because v3 ships
  // pure ESM (export / import syntax) which Node's CommonJS loader rejects.
  // The negative-lookahead pattern keeps every other package untouched.
  transformIgnorePatterns: ["/node_modules/(?!@noble/)"],

  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Map bare subpath imports (without .js) to their actual .js files so that
  // CommonJS resolution can find them when @noble/hashes uses package exports.
  moduleNameMapper: {
    "^@noble/hashes/(.*)(?<!\\.js)$":
      "<rootDir>/node_modules/@noble/hashes/$1.js",
  },
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,
};
