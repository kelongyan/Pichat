import { useEffect, useRef, useState } from 'react';
import { toImageDataUrl } from '../lib/imageStore';
import { formatDuration, PHASES, type StreamState, type PhaseRecord } from './chatUtils';
import styles from './Chat.module.css';

export function StreamBubble({ streamRef }: { streamRef: React.RefObject<StreamState | null> }) {
  const [state, setState] = useState<StreamState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(0);
  const phasesRef = useRef<PhaseRecord[]>([]);
  const lastStageRef = useRef<StreamState['stage'] | null>(null);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      const current = streamRef.current;
      if (!current) {
        setState((prev) => (prev ? null : prev));
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (current.stage && current.stage !== lastStageRef.current) {
        const phases = phasesRef.current;
        const now = performance.now();
        for (let i = phases.length - 1; i >= 0; i--) {
          if (!phases[i].endedAt) {
            phases[i].endedAt = now;
            break;
          }
        }
        phases.push({ phase: current.stage!, startedAt: now });
        lastStageRef.current = current.stage;
      }

      if (current.done) {
        const now = performance.now();
        for (let i = phasesRef.current.length - 1; i >= 0; i--) {
          if (!phasesRef.current[i].endedAt) {
            phasesRef.current[i].endedAt = now;
            break;
          }
        }
      }

      setElapsed(Math.round(performance.now() - current.startedAt));

      setState((prev) => {
        if (prev && prev.text === current.text
          && prev.imageBase64 === current.imageBase64 && prev.stage === current.stage) return prev;
        return { ...current };
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [streamRef]);

  if (!state) return null;

  const stageLabel = state.stage === 'generating' ? 'Generating'
    : state.stage === 'complete' ? 'Complete'
    : 'Starting';

  return (
    <div className={`${styles.message} ${styles.messageAi}`}>
      <div className={styles.resultCard}>
        <div className={styles.cardHeader}>
          <span className={styles.resultKicker}>{stageLabel}</span>
          <span className={styles.timer}>
            <span className={styles.timerValue}>{formatDuration(elapsed)}</span>
          </span>
        </div>

        <div className={styles.timeline}>
          {PHASES.map((phase) => {
            const record = phasesRef.current.find((r) => r.phase === phase.key);
            const isActive = state.stage === phase.key;
            const isDone = record?.endedAt != null && state.stage !== phase.key;
            const duration = record ? formatDuration(
              Math.round((record.endedAt ?? performance.now()) - record.startedAt)
            ) : null;

            const phaseClass = `${styles.phase}${isActive ? ` ${styles.phaseActive}` : ''}${isDone ? ` ${styles.phaseDone}` : ''}`;

            return (
              <div key={phase.key} className={phaseClass}>
                <span className={styles.phaseDot} />
                <span className={styles.phaseLabel}>{phase.label}</span>
                {duration && <span className={styles.phaseDuration}>{duration}</span>}
              </div>
            );
          })}
        </div>

        {state.imageBase64 ? (
          <div className={styles.imageFrame}>
            <img
              src={toImageDataUrl(state.imageBase64)}
              alt=""
              className={styles.streamImage}
            />
          </div>
        ) : (
          <div className={styles.skeleton}>
            <div className={styles.sheen} />
          </div>
        )}
      </div>
    </div>
  );
}
