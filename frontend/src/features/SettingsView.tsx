import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppStore } from '../stores/appStore';
import { checkHealth, normalizeBackendUrl } from '../services/api';
import { useNavigate } from 'react-router-dom';

const schema = z.object({
  endpoint: z.string().min(1, 'Gateway Endpoint is required').url('Must be a valid URL'),
});

type FormData = z.infer<typeof schema>;

type GPUStatus = 'disconnected' | 'connecting' | 'connected';

const CONFIGURED_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || '';

export function SettingsView() {
  const { backendUrl, setBackendUrl, lastConnected, isBackendConnected, setConnectionStatus } = useAppStore();
  const navigate = useNavigate();

  const [gpuStatus, setGpuStatus] = useState<GPUStatus>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const [testMessage, setTestMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);
  // Values the last test was run against, so editing fields afterwards invalidates the result
  const [testedConfig, setTestedConfig] = useState<{endpoint: string} | null>(null);

  // Initialize GPU status on mount based on store
  useEffect(() => {
    if (isBackendConnected) {
       // Optional: we can do a silent auto-test here if we want to verify it's still alive
       setGpuStatus('connected');
    } else {
       setGpuStatus('disconnected');
    }
  }, [isBackendConnected]);

  const { register, handleSubmit, watch, setValue, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      endpoint: backendUrl || import.meta.env.VITE_BACKEND_URL || '',
    },
    mode: 'onChange'
  });

  const currentEndpoint = watch('endpoint');

  // If user modifies fields after a successful test, revert to disconnected
  useEffect(() => {
    if (gpuStatus === 'connected' && testedConfig && currentEndpoint !== testedConfig.endpoint) {
      setGpuStatus('disconnected');
      setTestMessage(null);
    }
  }, [currentEndpoint, testedConfig, gpuStatus]);

  const formatUrl = () => {
    let url = currentEndpoint.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
      setValue('endpoint', url, { shouldValidate: true });
    }
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
      setValue('endpoint', url, { shouldValidate: true });
    }
  };

  const handleTestConnection = async (data: FormData) => {
    setGpuStatus('connecting');
    setTestMessage(null);
    setLatency(null);
    setTestedConfig({ endpoint: data.endpoint });
    
    try {
      const res = await checkHealth(data.endpoint);
      if (res.status === 'ok') {
        setGpuStatus('connected');
        setLatency(res.latency || 12);
        setTestMessage({
          type: 'success',
          text:
            res.rfdiffusion_ready === false
              ? 'Connected, but the model weights are not on the backend yet. Run download_weights first.'
              : res.message || 'Connection successful. GPU ready.',
        });
      } else {
        throw new Error('Invalid status');
      }
    } catch (err: any) {
      setGpuStatus('disconnected');
      
      let msg = 'Connection failed';
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        msg = 'Connection timeout. A cold Modal gateway can take a few seconds: try again.';
      } else if (err.message === 'Network Error' || !err.response) {
        msg = 'Network error: the backend is unreachable at this URL. If the Modal app was redeployed, its URL may have changed (see the `modal deploy` output).';
      } else if (err.response?.status >= 500) {
        msg = 'Server error on the backend.';
      }
      setTestMessage({ type: 'error', text: msg });
    }
  };

  const onSaveAndConnect = (data: FormData) => {
    if (gpuStatus !== 'connected') return;

    setBackendUrl(normalizeBackendUrl(data.endpoint));
    const now = new Date().toISOString();
    setConnectionStatus(true, now);

    // Quick success redirect
    navigate('/rfdiffusion/studio');
  };

  return (
    <div className="w-full min-h-[550px] h-full bg-white border border-ws-border rounded-[14px] flex flex-col overflow-hidden">
      {/* GPU STATUS BAR - ALWAYS VISIBLE AT TOP */}
      <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 ${
        gpuStatus === 'connected' ? 'bg-emerald-50 border-emerald-100' :
        gpuStatus === 'connecting' ? 'bg-amber-50 border-amber-100' :
        'bg-slate-50 border-slate-200'
      }`}>
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">GPU Status</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            gpuStatus === 'connected' ? 'bg-emerald-500' : 
            gpuStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 
            'bg-red-500'
          }`} />
          <span className={`text-xs font-bold ${
            gpuStatus === 'connected' ? 'text-emerald-700' : 
            gpuStatus === 'connecting' ? 'text-amber-700' : 
            'text-slate-600'
          }`}>
            {gpuStatus === 'connected' ? 'Connected' : 
             gpuStatus === 'connecting' ? 'Connecting...' : 
             'Disconnected'}
          </span>
          {gpuStatus === 'connected' && latency && (
            <span className="text-[10px] text-emerald-600 font-mono bg-emerald-100/50 px-1.5 py-0.5 rounded">
              {latency}ms
            </span>
          )}
        </div>
      </div>

      {/* CONTENT AREA - COMPACT & NO SCROLLING */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          
          <div className="mb-5 text-center">
            <h1 className="text-lg font-black text-slate-800 tracking-tight mb-0.5">
              GPU Gateway &amp; Backend Configuration
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Connect the studio to your Modal deployment (or a local backend)
            </p>
          </div>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Backend URL
              </label>
              <input
                type="url"
                {...register('endpoint')}
                onBlur={formatUrl}
                placeholder="https://<workspace>--biogen-rfdiffusion-api.modal.run"
                className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none transition-all"
              />
              {errors.endpoint && <p className="text-red-500 text-[10px] font-bold mt-1">{errors.endpoint.message}</p>}
              {CONFIGURED_URL &&
                normalizeBackendUrl(currentEndpoint || '') !== normalizeBackendUrl(CONFIGURED_URL) && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    This differs from the backend configured for this app (<span className="font-mono">{CONFIGURED_URL}</span>).{' '}
                    <button
                      type="button"
                      onClick={() => setValue('endpoint', CONFIGURED_URL, { shouldValidate: true })}
                      className="font-bold text-emerald-600 hover:text-emerald-700"
                    >
                      Use it
                    </button>
                  </p>
                )}
            </div>

            {testMessage && (
              <div className={`text-[11px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 ${
                testMessage.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}>
                {testMessage.text}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button 
                type="button"
                onClick={handleSubmit(handleTestConnection)}
                disabled={gpuStatus === 'connecting' || !isValid}
                className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-1.5 rounded-lg font-bold text-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
              >
                {gpuStatus === 'connecting' ? 'Testing...' : '🔗 Test Connection'}
              </button>
              
              <button 
                type="button"
                onClick={handleSubmit(onSaveAndConnect)}
                disabled={gpuStatus !== 'connected'}
                className="flex-1 bg-[#059669] hover:bg-[#047857] text-white px-4 py-1.5 rounded-lg font-bold text-xs transition-colors disabled:opacity-50 disabled:bg-slate-300 flex items-center justify-center gap-1.5 shadow-sm"
              >
                💾 Save & Connect
              </button>
            </div>
            
            {lastConnected && (
              <div className="text-center text-[10px] text-slate-400 font-medium pt-1">
                Last connected: {new Date(lastConnected).toLocaleString()}
              </div>
            )}
            
          </form>
        </div>
      </div>
    </div>
  );
}
