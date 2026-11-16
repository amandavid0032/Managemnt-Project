import { passwordIsValid } from "../components/auth/PasswordRules.jsx";

// Mirrors api/src/auth/dto/password.rules.ts — the API is the authority, this
// just keeps the form honest about what will be accepted.
describe("passwordIsValid", () => {
  it.each([
    ["ValidPass1234", true],
    ["short1A", false],
    ["alllowercase123", false],
    ["ALLUPPERCASE123", false],
    ["NoDigitsAtAllHere", false],
    [`A1${"a".repeat(127)}`, false], // over 128
  ])("%s → %s", (password, expected) => {
    expect(passwordIsValid(password)).toBe(expected);
  });
});
