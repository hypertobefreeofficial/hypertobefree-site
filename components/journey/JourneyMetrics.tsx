import styles from "./JourneyDashboard.module.css";

type JourneyMetricsProps = {
  storiesShared: number;
  prayersJoined: number;
  godDidIt: number;
  encouragements: number;
};

export default function JourneyMetrics({
  storiesShared,
  prayersJoined,
  godDidIt,
  encouragements,
}: JourneyMetricsProps) {
  const metrics = [
    { value: storiesShared, label: "Stories Shared" },
    { value: prayersJoined, label: "Prayers Joined" },
    { value: godDidIt, label: "God Did It" },
    { value: encouragements, label: "Encouragements" },
  ];

  return (
    <section className={styles.metrics} aria-label="Journey metrics">
      {metrics.map((metric) => (
        <article key={metric.label} className={styles.metricCard}>
          <div className={styles.metricValue}>{metric.value}</div>
          <div className={styles.metricLabel}>{metric.label}</div>
        </article>
      ))}
    </section>
  );
}
