export function joinRegExp(patterns: RegExp[]): RegExp {
  const combined = patterns
    .map(regex => regex.source)
    .reduce((prev, curr) => prev + curr);

  return new RegExp(combined);
}
