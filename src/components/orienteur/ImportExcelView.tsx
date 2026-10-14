import React, { useState, useRef } from 'react';
import { User, ImportReport } from '../../types';
import { parseExcelBuffer, generateSampleExcelFile, InterpretedRow, DetectedColumns } from '../../services/excelImporter';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowRight, 
  Sparkles,
  Download,
  Info
} from 'lucide-react';

interface ImportExcelViewProps {
  currentUser: User;
  onImportCompleted: () => void;
}

export const ImportExcelView: React.FC<ImportExcelViewProps> = ({
  currentUser,
  onImportCompleted,
}) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<DetectedColumns | null>(null);
  const [previewRows, setPreviewRows] = useState<InterpretedRow[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [executeFn, setExecuteFn] = useState<(() => ImportReport) | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFileBuffer = (buffer: ArrayBuffer, name: string) => {
    try {
      setErrorMsg(null);
      setReport(null);
      const parsed = parseExcelBuffer(buffer, currentUser.sectorId);
      setFileName(name);
      setDetectedColumns(parsed.detectedColumns);
      setPreviewRows(parsed.previewRows);
      setTotalRows(parsed.totalRawRows);
      setExecuteFn(() => parsed.executeImport);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors du traitement du fichier Excel.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      if (ev.target?.result instanceof ArrayBuffer) {
        handleProcessFileBuffer(ev.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadSampleFile = () => {
    const sampleBytes = generateSampleExcelFile();
    handleProcessFileBuffer(sampleBytes.buffer as ArrayBuffer, 'Tickets_SAV_3GCOM_Casablanca_14Octobre.xlsx');
  };

  const handleConfirmImport = () => {
    if (!executeFn) return;
    setIsProcessing(true);
    try {
      const rep = executeFn();
      setReport(rep);
      setPreviewRows([]);
      setExecuteFn(null);
      setFileName(null);
      onImportCompleted();
    } catch (err: any) {
      setErrorMsg(err.message || 'Échec lors de l\'enregistrement des tickets.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Page Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Chargement & Intégration du Fichier Excel
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Détection sémantique indépendante de l'ordre des colonnes · Rapport des rejets et calcul automatique du SLA 24h.
        </p>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center hover:border-slate-400 transition-colors shadow-xs">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.ods"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4 text-slate-400">
          <UploadCloud className="w-8 h-8 text-slate-500" />
        </div>

        <h3 className="text-base font-bold text-slate-900">
          Sélectionnez ou glissez votre fichier Excel (.xlsx ou .ods)
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Les colonnes sont reconnues par leur en-tête (ex: <i>N° Réclam.</i>, <i>Zone MSAN</i>, <i>Date</i>) quelle que soit leur position.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors"
          >
            Parcourir mes dossiers
          </button>

          <button
            onClick={handleLoadSampleFile}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Tester avec le fichier type du jour (1 clic)</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Erreur de lecture</div>
            <div className="mt-0.5">{errorMsg}</div>
          </div>
        </div>
      )}

      {/* Post-Import Detailed Report */}
      {report && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">
              Rapport d'Intégration du Fichier
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">Lignes traitées</span>
              <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1 block">
                {report.totalRowsProcessed}
              </span>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
              <span className="text-xs text-emerald-700 block font-semibold">Nouveaux dossiers</span>
              <span className="text-2xl font-bold text-emerald-800 font-mono tabular-nums mt-1 block">
                {report.importedCount}
              </span>
            </div>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
              <span className="text-xs text-amber-700 block font-semibold">2es visites rattachées</span>
              <span className="text-2xl font-bold text-amber-800 font-mono tabular-nums mt-1 block">
                {report.updatedVisitsCount}
              </span>
            </div>
            <div className="bg-rose-50 p-4 rounded-xl border border-rose-200">
              <span className="text-xs text-rose-700 block font-semibold">Lignes rejetées</span>
              <span className="text-2xl font-bold text-rose-800 font-mono tabular-nums mt-1 block">
                {report.rejectedCount}
              </span>
            </div>
          </div>

          {report.rejectedRows.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2">
                Détail des {report.rejectedRows.length} lignes rejetées
              </h3>
              <div className="overflow-x-auto border border-rose-100 rounded-xl">
                <table className="w-full text-left text-xs bg-rose-50/20">
                  <thead className="bg-rose-50 border-b border-rose-200 text-rose-800 font-semibold text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Ligne Excel</th>
                      <th className="py-2.5 px-3">Motif du rejet</th>
                      <th className="py-2.5 px-3">Données capturées</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {report.rejectedRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          #{r.rowNumber}
                        </td>
                        <td className="py-2.5 px-3 text-rose-700 font-medium">
                          {r.reason}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600 font-mono">
                          {JSON.stringify(r.data)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="text-right pt-2">
            <button
              onClick={() => onImportCompleted()}
              className="px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs"
            >
              Voir la file de dispatch
            </button>
          </div>
        </div>
      )}

      {/* 10-Row Interpretation Preview Before Validation */}
      {previewRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Aperçu des 10 premières lignes interprétées
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Vérifiez la bonne détection des colonnes avant validation pour {totalRows} lignes.
              </p>
            </div>

            <button
              onClick={handleConfirmImport}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl shadow-xs transition-colors whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Valider l'importation de {totalRows} réclamations</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-3">Ligne</th>
                  <th className="py-3 px-3">Ticket</th>
                  <th className="py-3 px-3">Client</th>
                  <th className="py-3 px-3">Téléphone</th>
                  <th className="py-3 px-3">Zone Excel</th>
                  <th className="py-3 px-3">Zone Reconnue</th>
                  <th className="py-3 px-3">Statut Ligne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {previewRows.map(row => (
                  <tr key={row.rowNumber} className={!row.isValid ? 'bg-rose-50/60' : 'hover:bg-slate-50/50'}>
                    <td className="py-2.5 px-3 font-mono text-slate-500">#{row.rowNumber}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{row.ticketNumber || 'VIDE'}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{row.clientName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{row.clientPhone}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{row.rawZoneText}</td>
                    <td className="py-2.5 px-3">
                      {row.resolvedZoneLabel ? (
                        <span className="text-emerald-700 font-semibold">✓ {row.resolvedZoneLabel}</span>
                      ) : (
                        <span className="text-amber-700 font-semibold">⚠️ À rattacher</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {row.isValid ? (
                        <span className="text-emerald-700 font-bold">Valide</span>
                      ) : (
                        <span className="text-rose-700 font-bold">Rejet : {row.rejectionReason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
