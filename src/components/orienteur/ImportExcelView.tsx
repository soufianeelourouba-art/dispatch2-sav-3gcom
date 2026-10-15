import React, { useState, useRef } from 'react';
import { User, ImportReport } from '../../types';
import { store } from '../../services/storage';
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
  Info,
  MapPin,
  Building2,
  Users
} from 'lucide-react';

interface ImportExcelViewProps {
  currentUser: User;
  onImportCompleted: () => void;
}

export const ImportExcelView: React.FC<ImportExcelViewProps> = ({
  currentUser,
  onImportCompleted,
}) => {
  const availableSectors = store.getSectors(currentUser);
  const [selectedSectorId, setSelectedSectorId] = useState<string>(() => {
    return currentUser.activeSectorId || (currentUser.sectorIds && currentUser.sectorIds[0]) || currentUser.sectorId || (availableSectors[0]?.id || '');
  });

  const [fileName, setFileName] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<DetectedColumns | null>(null);
  const [previewRows, setPreviewRows] = useState<InterpretedRow[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [executeFn, setExecuteFn] = useState<(() => ImportReport) | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSectorObj = availableSectors.find(s => s.id === selectedSectorId) || availableSectors[0];
  const sectorZones = store.getTechnicalZones(currentUser, selectedSectorId);
  const sectorTechs = store.getTechnicians(currentUser, selectedSectorId).filter(t => t.isActive);

  const handleProcessFileBuffer = (buffer: ArrayBuffer, name: string) => {
    try {
      setErrorMsg(null);
      setReport(null);
      const parsed = parseExcelBuffer(buffer, selectedSectorId);
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
    const sampleBytes = generateSampleExcelFile(selectedSectorId);
    const secName = currentSectorObj ? currentSectorObj.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Secteur';
    handleProcessFileBuffer(sampleBytes.buffer as ArrayBuffer, `Tickets_SAV_${secName}_FichierType.xlsx`);
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
      
      {/* Page Title & Sector Scope Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <span>Chargement des Tickets SAV par Secteur</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Chaque fichier est dédié à un <b>Secteur</b>. La colonne <b>Zone</b> sera lue pour dispatcher automatiquement aux techniciens de ces zones.
            </p>
          </div>

          {/* Sector Selector */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 shrink-0">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span>Secteur cible :</span>
            </span>
            <select
              value={selectedSectorId}
              onChange={e => {
                setSelectedSectorId(e.target.value);
                setPreviewRows([]);
                setExecuteFn(null);
                setFileName(null);
                setErrorMsg(null);
                setReport(null);
              }}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {availableSectors.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Sector Context Badge */}
        {currentSectorObj && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span><b>{sectorZones.length}</b> zones d'intervention couvertes</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Users className="w-4 h-4 text-blue-600" />
              <span><b>{sectorTechs.length}</b> techniciens actifs prêts au dispatch</span>
            </div>
            <div className="text-[11px] text-slate-600 italic">
              Zones : {sectorZones.map(z => z.label).slice(0, 4).join(', ')}{sectorZones.length > 4 ? '...' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 sm:p-10 text-center hover:border-slate-400 transition-colors shadow-xs">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.ods"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4 text-emerald-600">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-base font-bold text-slate-900">
          Charger le fichier Excel du secteur <span className="text-emerald-700">« {currentSectorObj?.name} »</span>
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Détection automatique des colonnes (<i>N° Réclam.</i>, <i>Zone MSAN</i>, <i>Client</i>, <i>Téléphone</i>, <i>Date</i>) quelle que soit leur position.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors"
          >
            Parcourir mon ordinateur (.xlsx)
          </button>

          <button
            onClick={handleLoadSampleFile}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Charger un fichier type pour ce secteur (Test 1 clic)</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs flex items-start gap-3 shadow-xs">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Erreur de lecture du fichier</div>
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
              Rapport d'Intégration du Secteur {currentSectorObj?.name}
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
                Détail des {report.rejectedRows.length} ligne(s) rejetée(s)
              </h3>
              <div className="overflow-x-auto border border-rose-100 rounded-xl">
                <table className="w-full text-left text-xs bg-rose-50/20">
                  <thead className="bg-rose-50 border-b border-rose-200 text-rose-800 font-semibold text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Ligne</th>
                      <th className="py-2.5 px-3">Motif du rejet</th>
                      <th className="py-2.5 px-3">Données ligne</th>
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
              Voir la file de dispatch de ce secteur →
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
                Aperçu des lignes détectées pour « {currentSectorObj?.name} »
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Vérifiez la concordance des zones avec les techniciens du secteur avant validation finale. Total lignes : {totalRows}.
              </p>
            </div>

            <button
              onClick={handleConfirmImport}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition-colors disabled:opacity-50 shrink-0"
            >
              <span>{isProcessing ? 'Intégration en cours...' : `Confirmer & Intégrer les tickets`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-3">Ligne</th>
                  <th className="py-3 px-3">N° Réclamation</th>
                  <th className="py-3 px-3">Client</th>
                  <th className="py-3 px-3">Téléphone</th>
                  <th className="py-3 px-3">Zone lue</th>
                  <th className="py-3 px-3">Zone validée (Secteur)</th>
                  <th className="py-3 px-3">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map(row => (
                  <tr key={row.rowNumber} className={!row.isValid ? 'bg-rose-50/50' : 'hover:bg-slate-50/60'}>
                    <td className="py-2.5 px-3 font-mono text-slate-500">#{row.rowNumber}</td>
                    <td className="py-2.5 px-3 font-bold font-mono text-slate-900">{row.ticketNumber || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-800">{row.clientName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{row.clientPhone || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 font-semibold">{row.rawZoneText}</td>
                    <td className="py-2.5 px-3">
                      {row.resolvedZoneLabel ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{row.resolvedZoneLabel}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-medium border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>Zone inconnue</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {row.isValid ? (
                        <span className="text-emerald-700 font-semibold text-[11px]">Prêt au dispatch</span>
                      ) : (
                        <span className="text-rose-700 font-medium text-[11px] block max-w-xs">{row.rejectionReason}</span>
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
