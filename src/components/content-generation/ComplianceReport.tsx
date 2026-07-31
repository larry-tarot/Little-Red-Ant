
import { AlertTriangle, CheckCircle, AlertCircle, Wand2, Loader2 } from 'lucide-react';

interface ComplianceReportProps {
  warnings?: {
    blocked: string[];
    warnings: string[];
    suggestions: string[];
    score: number;
  };
  className?: string;
  onAutoFix?: () => void; // New prop
  isFixing?: boolean; // New prop
}

export default function ComplianceReport({ warnings, className = '', onAutoFix, isFixing = false }: ComplianceReportProps) {
  if (!warnings) return null;

  const { blocked, warnings: warnList, suggestions, score } = warnings;
  const isClean = blocked.length === 0 && warnList.length === 0;

  if (isClean) {
    return (
      <div className={`bg-success-subtle border border-success-subtle rounded-lg p-4 flex items-start ${className}`}>
        <CheckCircle className="text-success mt-0.5 mr-3 flex-shrink-0" size={18} />
        <div>
          <h4 className="text-sm font-bold text-success">内容合规检测通过</h4>
          <p className="text-xs text-success mt-1">未发现违禁词或敏感词 (合规分: {score})</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border rounded-lg overflow-hidden ${className}`}>
      <div className={`p-4 border-b flex items-center justify-between ${blocked.length > 0 ? 'bg-danger-subtle border-danger-subtle' : 'bg-warning-subtle border-warning-subtle'}`}>
        <div className="flex items-center">
          <AlertTriangle className={`${blocked.length > 0 ? 'text-danger' : 'text-warning'} mr-2`} size={20} />
          <h4 className={`text-sm font-bold ${blocked.length > 0 ? 'text-danger' : 'text-warning'}`}>
            {blocked.length > 0 ? '发现严重违规内容' : '发现潜在风险内容'}
          </h4>
        </div>
        <div className="flex items-center space-x-2">
            <div className={`text-xs font-bold px-2 py-1 rounded ${blocked.length > 0 ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning'}`}>
              合规分: {score}
            </div>
            
            {onAutoFix && (blocked.length > 0 || warnList.length > 0) && (
                <button 
                    onClick={onAutoFix}
                    disabled={isFixing}
                    className="flex items-center px-3 py-1 bg-primary text-primary-text text-xs font-medium rounded hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                    {isFixing ? (
                        <>
                           <Loader2 className="animate-spin mr-1" size={12} /> 修复中...
                        </>
                    ) : (
                        <>
                           <Wand2 className="mr-1" size={12} /> AI 一键修复
                        </>
                    )}
                </button>
            )}
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {blocked.length > 0 && (
          <div>
            <h5 className="text-xs font-bold text-danger uppercase mb-2 flex items-center">
              <AlertCircle size={12} className="mr-1" /> 违禁词 (必须修改)
            </h5>
            <div className="flex flex-wrap gap-2">
              {blocked.map((w, i) => (
                <div key={i} className="flex flex-col">
                  <span className="px-2 py-1 bg-danger-subtle text-danger text-xs rounded border border-danger-subtle">
                    {w}
                  </span>
                  {/* Suggestion if available */}
                  {suggestions.some(s => s.includes(w)) && (
                    <span className="text-[10px] text-text-tertiary mt-0.5">
                       建议替换: {suggestions.find(s => s.includes(w))?.split('建议')[1] || '请修改'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {warnList.length > 0 && (
          <div>
            <h5 className="text-xs font-bold text-warning uppercase mb-2">敏感词 (建议修改)</h5>
            <div className="flex flex-wrap gap-2">
              {warnList.map((w, i) => (
                <span key={i} className="px-2 py-1 bg-warning-subtle text-warning text-xs rounded border border-warning-subtle">
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="bg-surface-muted p-3 rounded text-xs text-text-secondary">
            <span className="font-bold mb-1 block">修改建议：</span>
            <ul className="list-disc list-inside space-y-1">
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
