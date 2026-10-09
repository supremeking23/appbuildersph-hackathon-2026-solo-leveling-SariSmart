interface SummaryCardsProps {
  sales: number;
  inventoryValue: number;
  lowStockCount: number;
  transactionCount: number;
}

const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);

function SummaryCards({ sales, inventoryValue, lowStockCount, transactionCount }: SummaryCardsProps) {
  return (
    <section className="summary-grid" aria-label="Store summary">
      <article className="summary-card sales-card">
        <div className="summary-card-top">
          <span className="summary-icon sales-icon" aria-hidden="true">₱</span>
          <span className="card-trend"><span aria-hidden="true">↗</span> TODAY</span>
        </div>
        <span className="summary-label">Sales today</span>
        <strong className="summary-value">{peso(sales)}</strong>
        <span className="summary-footnote">From {transactionCount} logged transaction{transactionCount === 1 ? "" : "s"}</span>
        <span className="card-decoration sales-decoration" aria-hidden="true">₱</span>
      </article>
      <article className="summary-card">
        <div className="summary-card-top">
          <span className="summary-icon stock-icon" aria-hidden="true">▤</span>
          <span className="summary-mini-label">AT SELLING PRICE</span>
        </div>
        <span className="summary-label">Inventory value</span>
        <strong className="summary-value">{peso(inventoryValue)}</strong>
        <span className="summary-footnote">Across all products in your store</span>
      </article>
      <article className={`summary-card${lowStockCount ? " alert-card" : ""}`}>
        <div className="summary-card-top">
          <span className={`summary-icon ${lowStockCount ? "alert-icon" : "healthy-icon"}`} aria-hidden="true">
            {lowStockCount ? "!" : "✓"}
          </span>
          <span className={`status-pill ${lowStockCount ? "needs-attention" : "all-good"}`}>
            {lowStockCount ? "NEEDS ATTENTION" : "ALL GOOD"}
          </span>
        </div>
        <span className="summary-label">Running low</span>
        <strong className="summary-value">{lowStockCount} <span className="value-unit">items</span></strong>
        <span className="summary-footnote">Below your stock alert level</span>
      </article>
      <article className="summary-card">
        <div className="summary-card-top">
          <span className="summary-icon activity-icon" aria-hidden="true">↻</span>
          <span className="summary-mini-label">TODAY</span>
        </div>
        <span className="summary-label">Store activity</span>
        <strong className="summary-value">{transactionCount} <span className="value-unit">updates</span></strong>
        <span className="summary-footnote">Sales and restocks logged today</span>
      </article>
    </section>
  );
}

export default SummaryCards;
