import { Button, Modal, Tooltip, type ModalProps } from 'antd';
import { X } from '@sofa-design/icons';
import { useLocale } from '../locales';
import { ErrorNotice } from './common';
import styles from './common.module.less';

export function BusinessModal({ closable, ...props }: ModalProps) {
  const { t } = useLocale();
  return <Modal width={600} centered maskClosable={false} closable={closable === false ? false : { 'aria-label': t('close'), closeIcon: <Tooltip title={t('close')}><span><X/></span></Tooltip> }} {...props}/>;
}

export function DangerConfirm({ open, title, description, onConfirm, onCancel, loading, error }: { open: boolean; title: string; description: string; onConfirm: () => void; onCancel: () => void; loading: boolean; error?: Error | null }) {
  const { t } = useLocale();
  if (!open) return null;
  return <BusinessModal open={open} title={title} onCancel={onCancel} closable={!loading} footer={<><Button onClick={onCancel} disabled={loading}>{t('cancel')}</Button><Button danger type="primary" loading={loading} onClick={onConfirm}>{t('confirmCancel')}</Button></>}><p className={styles.modalHint}>{description}</p>{error && <ErrorNotice error={error}/>}</BusinessModal>;
}
