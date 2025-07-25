module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^@utils/(.*)$": "<rootDir>/utils/$1",
  },
};
