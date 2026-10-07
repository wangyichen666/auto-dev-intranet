import { useLocale } from '../locales';
import { readClaudeOutput } from '../services/output';
import type { Attempt } from '../typings/api';
import styles from './output.module.less';

export function ExecutionOutput({ attempt }: { attempt: Attempt }) {
  const { t } = useLocale();
  const output = attempt.engine === 'claude-cli' ? readClaudeOutput(attempt.stdout) : null;
  return <section className={styles.output}>
    <h3>{t('logs')}</h3>
    {!attempt.stdout && !attempt.stderr ? <p className="muted">{t('noOutput')}</p> : <>
      <p className={styles.hint}>{t('outputLimitHint')}</p>
      {attempt.stdout && <div>
        <h4 className={styles.label}>{t('stdout')}</h4>
        {output?.recognized ? <>
          <ol className={styles.entries}>{output.entries.map((entry, index) => <li key={index}>
            <span className={styles.label}>{t(entry.kind)}</span>{entry.text && <pre>{entry.text}</pre>}
          </li>)}</ol>
          {!output.entries.some(entry => ['modelReply', 'modelResult'].includes(entry.kind) && entry.text.trim()) && <p className={styles.hint}>{t('noReadableReply')}</p>}
          {output.incomplete && <p className={styles.hint}>{t('incompleteOutput')}</p>}
          <details className={styles.raw}><summary>{t('rawOutput')}</summary><pre className={styles.log}>{attempt.stdout}</pre></details>
        </> : <pre className={styles.log}>{attempt.stdout}</pre>}
      </div>}
      {attempt.stderr && <div><h4 className={styles.label}>{t('stderr')}</h4><pre className={styles.log}>{attempt.stderr}</pre></div>}
    </>}
  </section>;
}
