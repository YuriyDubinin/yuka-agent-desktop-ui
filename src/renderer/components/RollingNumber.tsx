const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Renders a formatted number whose digits roll like an odometer when they change. */
export function RollingNumber({ value }: { value: string }) {
  const chars = [...value];
  return (
    <span className="roll" aria-label={value} role="text">
      {chars.map((ch, index) => {
        // Key from the right so columns stay put when the number grows or shrinks.
        const key = chars.length - index;
        if (!/\d/.test(ch)) {
          return (
            <span key={key} className="roll__char" aria-hidden="true">
              {ch}
            </span>
          );
        }
        return (
          <span key={key} className="roll__digit" aria-hidden="true">
            <span className="roll__strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {DIGITS.map((digit) => (
                <span key={digit}>{digit}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
