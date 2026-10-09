import { useState, type FormEvent } from "react";

interface LogInputProps {
  isLoading: boolean;
  onSubmit: (rawInput: string) => Promise<boolean>;
}

function LogInput({ isLoading, onSubmit }: LogInputProps) {
  const [value, setValue] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    if (await onSubmit(trimmed)) setValue("");
  }

  return (
    <form className="log-form" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="store-log">Describe a sale or restock</label>
      <textarea
        id="store-log"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="e.g. Nakabenta ako ng 3 pancit canton at 2 coke"
        rows={3}
        maxLength={500}
        disabled={isLoading}
      />
      <div className="log-form-bottom">
        <span className="input-hint"><span aria-hidden="true">✦</span> No need for perfect spelling, gets namin ’yan.</span>
        <button className="submit-log" type="submit" disabled={!value.trim() || isLoading}>
          {isLoading ? (
            <><span className="button-spinner" /> Processing</>
          ) : (
            <>Log it <span aria-hidden="true">↗</span></>
          )}
        </button>
      </div>
    </form>
  );
}

export default LogInput;
