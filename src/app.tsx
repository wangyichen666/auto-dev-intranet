import { lazy, Suspense, useState } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/es/locale/zh_CN';
import enUS from 'antd/es/locale/en_US';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './layouts/Shell';
const Tasks = lazy(() => import('./pages/Tasks').then(module => ({ default: module.Tasks })));
const TaskDetail = lazy(() => import('./pages/TaskDetail').then(module => ({ default: module.TaskDetail })));
const Workflows = lazy(() => import('./pages/Workflows').then(module => ({ default: module.Workflows })));
const WorkflowDetailPage = lazy(() => import('./pages/Workflows').then(module => ({ default: module.WorkflowDetailPage })));
const Repositories = lazy(() => import('./pages/Repositories').then(module => ({ default: module.Repositories })));
const System = lazy(() => import('./pages/System').then(module => ({ default: module.System })));
import { Access } from './pages/Access';
import { LocaleProvider, useLocale } from './locales';
import { ApiProvider, APIError } from './services/api';
import { EmptyState, LoadingState } from './components/common';
import { theme } from './styles/theme';
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1500, retry: (count, error) => !(error instanceof APIError && [400, 401, 403, 404, 409, 503].includes(error.status)) && count < 1, refetchOnWindowFocus: true } } });
function Application() {
  const { locale, t } = useLocale(); const [token, setToken] = useState('');
  const disconnect = () => { void queryClient.cancelQueries(); queryClient.clear(); setToken(''); };
  return <ConfigProvider button={{ autoInsertSpace: false }} locale={locale === 'zh-CN' ? zhCN : enUS} theme={theme()}>{token ? <ApiProvider token={token}><BrowserRouter><Suspense fallback={<LoadingState/>}><Routes><Route element={<Shell onDisconnect={disconnect}/> }><Route index element={<Navigate to="/tasks" replace/>}/><Route path="/tasks" element={<Tasks/>}/><Route path="/tasks/:runId" element={<TaskDetail/>}/><Route path="/workflows" element={<Workflows/>}/><Route path="/workflows/:templateId" element={<WorkflowDetailPage/>}/><Route path="/repositories" element={<Repositories/>}/><Route path="/system" element={<System/>}/><Route path="*" element={<EmptyState title="notFound" action={<Link to="/tasks">{t('home')}</Link>}/>}/></Route></Routes></Suspense></BrowserRouter></ApiProvider> : <Access onConnect={setToken}/>}</ConfigProvider>;
}
export default function App() { return <LocaleProvider><QueryClientProvider client={queryClient}><Application/></QueryClientProvider></LocaleProvider>; }
