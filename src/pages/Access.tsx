import { useRef, useState } from 'react';
import { Button, Form, Input } from 'antd';
import { Terminal, Lock } from '@sofa-design/icons';
import { useLocale } from '../locales';
import { Client } from '../services/api';
import { ErrorNotice } from '../components/common';
import styles from './access.module.less';
export function Access({ onConnect }: { onConnect: (token: string) => void }) {
  const { t } = useLocale(); const [error, setError] = useState<Error | null>(null); const [pending, setPending] = useState(false); const lock = useRef(false);
  const connect = async ({ token }: { token: string }) => { if (lock.current) return; lock.current = true; setPending(true); setError(null); try { await new Client(token).health(); onConnect(token); } catch (e) { setError(e as Error); } finally { lock.current = false; setPending(false); } };
  return <div className={styles.page}><div className={styles.form}><div className={styles.brand}><Terminal/>{t('product')}</div><h1>{t('accessTitle')}</h1><p className={styles.description}>{t('accessDescription')}</p>{error && <ErrorNotice error={error}/>}<Form layout="vertical" requiredMark={false} onFinish={values => void connect(values)}><Form.Item name="token" label={t('accessToken')} rules={[{ required: true, whitespace: true, message: t('tokenRequired') }]}><Input.Password prefix={<Lock/>} autoComplete="off" disabled={pending}/></Form.Item><Button block type="primary" htmlType="submit" loading={pending}>{t('connect')}</Button></Form></div></div>;
}
