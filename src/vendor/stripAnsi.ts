/**
 * Lightweight strip-ansi replacement
 * Removes ANSI escape sequences from strings.
 */
function ansiRegex(onlyFirst) {
  var ST = "(?:\\u0007|\\u001B\\u005C|\\u009C)";
  var osc = "(?:\\u001B\\][\\s\\S]*?" + ST + ")";
  var csi = "[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;.]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";
  return new RegExp(osc + "|" + csi, onlyFirst ? void 0 : "g");
}
export default function stripAnsi(string) {
  if (typeof string !== "string") {
    throw new TypeError('Expected a `string`, got `' + typeof string + '`');
  }
  if (!string.includes("\u001B") && !string.includes("\u009B")) {
    return string;
  }
  return string.replace(ansiRegex(false), '');
}
