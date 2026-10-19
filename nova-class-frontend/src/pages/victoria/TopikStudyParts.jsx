import { t } from "./topikStyles";

// The study help text of K_MATE TOPIK: a strategy guide (steps, tips, common traps) and a grammar explanation (rule,
// form, 3 examples). Sized for the sidebar; the colours come from the app's theme variables.
export function GuideContent({ data }) {
  return (
    <div style={t.text}>
      {data.overview && <p style={{ margin: "0 0 8px" }}>{data.overview}</p>}
      {data.steps?.length > 0 && (<><strong>How to solve it</strong><ol style={t.list}>{data.steps.map((x, i) => <li key={i}>{x}</li>)}</ol></>)}
      {data.tips?.length > 0 && (<><strong>Tips</strong><ul style={t.list}>{data.tips.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {data.mistakes?.length > 0 && (<><strong>Common traps</strong><ul style={t.list}>{data.mistakes.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
    </div>
  );
}

export function ExplanationContent({ data }) {
  if (data.kind === "none") return <p style={t.muted}>There is no guide for this question type yet.</p>;
  if (data.kind === "strategy") return (<><strong style={t.text}>Strategy guide · {data.label}</strong><GuideContent data={data} /></>);
  return (
    <div style={t.text}>
      <p style={{ margin: "0 0 6px" }}>{data.rule}</p>
      {data.form && <p style={{ margin: "0 0 6px" }}><strong>Form:</strong> <code style={t.code}>{data.form}</code></p>}
      {data.notes?.length > 0 && <ul style={t.list}>{data.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      <strong>Examples</strong>
      <ol style={t.list} data-testid="grammar-examples">
        {data.examples.map((e, i) => (<li key={i}><span style={{ fontWeight: 600 }}>{e.ko}</span><br /><span style={t.muted}>{e.translation}</span></li>))}
      </ol>
    </div>
  );
}
