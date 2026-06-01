// ===== Firebase Cloud Setup =====
const firebaseConfig = {
  apiKey: "AIzaSyDLWZyC1Av6u3hMNtyVxPTgUuQ3fHoqOAA",
  authDomain: "prevrisk-dashboard.firebaseapp.com",
  projectId: "prevrisk-dashboard",
  storageBucket: "prevrisk-dashboard.firebasestorage.app",
  messagingSenderId: "213328578822",
  appId: "1:213328578822:web:661f8dc68349cc92087687"
};
firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();
const storage = firebase.storage();

// ===== Data Layer (localStorage + Firestore sync) =====
const STORAGE_KEY = 'prevrisk_items';
const ACTIVITY_KEY = 'prevrisk_activity';
const DIVE_KEY = 'prevrisk_dives';
const FILES_META_KEY = 'prevrisk_files_meta';
const PERSONAL_KEY = 'prevrisk_personal';

function loadPersonal() {
  try { return JSON.parse(localStorage.getItem(PERSONAL_KEY)) || []; }
  catch { return []; }
}
function savePersonal(personalData) {
  localStorage.setItem(PERSONAL_KEY, JSON.stringify(personalData));
  cloudSave('store/personal', personalData);
}

function loadFilesMeta() {
  try { return JSON.parse(localStorage.getItem(FILES_META_KEY)) || []; }
  catch { return []; }
}
function saveFilesMeta(meta) {
  localStorage.setItem(FILES_META_KEY, JSON.stringify(meta));
  cloudSave('store/files_meta', meta);
}

let _cst=null;
function setCloudStatus(s){const el=document.getElementById('cloudIndicator'),ic=document.getElementById('cloudIcon');if(!el)return;const m={syncing:{color:'var(--accent)',border:'rgba(139,92,246,.3)',icon:'cloud_upload'},error:{color:'var(--danger)',border:'rgba(239,68,68,.3)',icon:'cloud_off'},synced:{color:'var(--success)',border:'rgba(34,197,94,.3)',icon:'cloud_done'}};const d=m[s]||m.synced;el.style.color=d.color;el.style.borderColor=d.border;if(ic){ic.textContent=d.icon;ic.style.animation=s==='syncing'?'spin .8s linear infinite':'';el.title=s==='syncing'?'Sincronizando...':s==='error'?'Sin conexión — cambios guardados localmente':'Sincronizado con la nube';}}
function cloudSave(docPath,data){setCloudStatus('syncing');clearTimeout(_cst);firestore.doc(docPath).set({data:JSON.parse(JSON.stringify(data)),updatedAt:new Date().toISOString()}).then(()=>{_cst=setTimeout(()=>setCloudStatus('synced'),800);}).catch(e=>{console.warn('Cloud save error:',e);setCloudStatus('error');});}

function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  cloudSave('store/items', items);
}
function loadActivity() {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY)) || []; }
  catch { return []; }
}
function saveActivity(list) {
  const sliced = list.slice(0, 50);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(sliced));
  cloudSave('store/activity', sliced);
}
function addActivity(text) {
  const list = loadActivity();
  list.unshift({ text, time: new Date().toISOString() });
  saveActivity(list);
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function loadDives() {
  try { return JSON.parse(localStorage.getItem(DIVE_KEY)) || []; }
  catch { return []; }
}
function saveDives(dives) {
  localStorage.setItem(DIVE_KEY, JSON.stringify(dives));
  cloudSave('store/dives', dives);
}


// ===== DOM Refs =====
const $ = id => document.getElementById(id);
const sidebar = $('sidebar');
const menuToggle = $('menuToggle');
const themeToggle = $('themeToggle');
const globalSearch = $('globalSearch');
const btnNewItem = $('btnNewItem');
const modalOverlay = $('modalOverlay');
const modalClose = $('modalClose');
const btnCancel = $('btnCancel');
const btnSave = $('btnSave');
const btnDelete = $('btnDelete');
const toastContainer = $('toastContainer');

// ===== IndexedDB for File Storage =====
const DB_NAME = 'prevrisk_files';
const DB_VERSION = 1;
let db = null;

function openDB() {
  return Promise.resolve();
}

async function dbStoreFile(entityKey, fileName, fileBlob, meta = {}) {
  const id = entityKey + '::' + fileName + '::' + Date.now();
  let url = meta.url || '';
  
  try {
    if (fileBlob) {
      const fileRef = storage.ref(`uploads/${id}`);
      await fileRef.put(fileBlob);
      url = await fileRef.getDownloadURL();
    }

    const fileMeta = {
      id, entityKey, fileName,
      type: fileBlob ? fileBlob.type : 'url',
      size: fileBlob ? fileBlob.size : 0,
      uploadDate: new Date().toISOString(),
      vencimiento: meta.vencimiento || null,
      descripcion: meta.descripcion || '',
      isLink: !!meta.isLink,
      url: url
    };

    const allMeta = loadFilesMeta();
    allMeta.push(fileMeta);
    saveFilesMeta(allMeta);
    
    return id;
  } catch (error) {
    console.error('Error al subir archivo:', error);
    alert('Error al subir archivo: ' + error.message);
    throw error;
  }
}

function dbGetFiles(entityKey) {
  const allMeta = loadFilesMeta();
  return Promise.resolve(allMeta.filter(m => m.entityKey === entityKey));
}

function dbDeleteFile(id) {
  const allMeta = loadFilesMeta();
  const fileMeta = allMeta.find(m => m.id === id);
  if (fileMeta && !fileMeta.isLink) {
    storage.ref(`uploads/${id}`).delete().catch(e => console.warn('Error deleting from storage:', e));
  }
  const filtered = allMeta.filter(m => m.id !== id);
  saveFilesMeta(filtered);
  return Promise.resolve();
}

function dbDownloadFile(id) {
  const allMeta = loadFilesMeta();
  const fileMeta = allMeta.find(m => m.id === id);
  return Promise.resolve(fileMeta);
}

// ===== Navigation =====
let currentDetailKey = null;

// Vistas que tienen su propia sección y NO deben ir a view-detail
const CUSTOM_VIEWS = ['extintores', 'epp', 'acc-estadisticas', 'acc-nomina', 'emb-maria-jose', 'emb-alvarito', 'emb-aukan', 'emb-don-humberto', 'emb-lafquen', 'sst-carta-gantt'];

function navigateTo(viewId) {
  // Clear all active states
  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Check if it's a detail view (pero no si tiene vista propia)
  const detailConfig = DETAIL_PAGES[viewId];
  if (detailConfig && !CUSTOM_VIEWS.includes(viewId)) {
    currentDetailKey = viewId;
    const el = $('view-detail');
    if (el) el.classList.add('active');
    renderDetailPage(viewId, detailConfig);
    // Highlight the sub-item or nav-item
    const subItem = document.querySelector(`.nav-sub-item[data-view="${viewId}"]`);
    const navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (subItem) {
      subItem.classList.add('active');
      const group = subItem.closest('.nav-group');
      if (group) group.classList.add('open');
    } else if (navItem) {
      navItem.classList.add('active');
    }
  } else {
    const viewAliases = {
      'acc-nomina': 'acc-estadisticas',
      'emb-maria-jose': 'emb-detail', 'emb-alvarito': 'emb-detail',
      'emb-aukan': 'emb-detail', 'emb-don-humberto': 'emb-detail', 'emb-lafquen': 'emb-detail',
      'sst-carta-gantt': 'sst-carta-gantt'
    };
    currentDetailKey = viewId;
    const resolvedId = viewAliases[viewId] || viewId;
    const el = $('view-' + resolvedId);
    if (el) el.classList.add('active');
    const navItem = document.querySelector(`.nav-item[data-view="${viewId}"], .nav-sub-item[data-view="${viewId}"]`);
    if (navItem) {
      navItem.classList.add('active');
      const group = navItem.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  }

  if (window.innerWidth < 768) sidebar.classList.remove('open');
  refreshAll();

  // Render embarcación DESPUÉS de refreshAll para que no se sobreescriba
  if (typeof EMBARCACIONES_DATA !== 'undefined' && EMBARCACIONES_DATA[viewId]) {
    EMBARCACIONES_DATA[viewId].estado = getEmbEstado ? getEmbEstado(viewId) : EMBARCACIONES_DATA[viewId].estado;
    setTimeout(() => {
      if (typeof renderEmbarcacion === 'function') renderEmbarcacion(viewId);
      if (typeof updateBtnCambioEstado === 'function') updateBtnCambioEstado(viewId);
    }, 100);
  }
}

// Flat nav items
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.view);
  });
});

// Collapsible groups
document.querySelectorAll('.nav-group-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.nav-group').classList.toggle('open');
  });
});

// Sub-items
document.querySelectorAll('.nav-sub-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.view);
  });
});

menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

// Cerrar sidebar al hacer click fuera en móvil
document.addEventListener('click', (e) => {
  if (window.innerWidth < 768 && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target) && e.target !== menuToggle) {
      sidebar.classList.remove('open');
    }
  }
});


function initTheme() {
  const saved = localStorage.getItem('prevrisk_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  themeToggle.querySelector('.material-icons-round').textContent = saved === 'dark' ? 'light_mode' : 'dark_mode';
}
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('prevrisk_theme', next);
  themeToggle.querySelector('.material-icons-round').textContent = next === 'dark' ? 'light_mode' : 'dark_mode';
});

// ===== Toast =====
function showToast(msg,type='success'){const icons={success:'check_circle',error:'error',warning:'warning',info:'info'};const toast=document.createElement('div');toast.className='toast toast-'+type;toast.innerHTML=`<span class="material-icons-round">${icons[type]||'check_circle'}</span><span>${msg}</span>`;toastContainer.appendChild(toast);setTimeout(()=>{toast.style.opacity='0';toast.style.transform='translateX(20px)';setTimeout(()=>toast.remove(),300);},3200);}

// ===== Modal =====
function openModal(item = null) {
  $('itemForm').reset();
  $('itemId').value = '';
  btnDelete.style.display = 'none';
  hideConditionalFields();
  const btnPrint = $('btnModalPrint');
  if (item) {
    $('modalTitle').textContent = 'Editar Elemento';
    if (btnPrint) btnPrint.style.display = 'block';
    $('itemId').value = item.id;
    $('itemCategory').value = item.category;
    $('itemTitle').value = item.title;
    $('itemDescription').value = item.description || '';
    $('itemPriority').value = item.priority;
    $('itemStatus').value = item.status;
    $('itemDueDate').value = item.dueDate || '';
    $('itemAssignee').value = item.assignee || '';
    $('itemAsistentes').value = item.asistentes || '';
    $('itemDocType').value = item.docType || 'matriz';
    $('itemUbicacion').value = item.ubicacion || '';
    $('itemHallazgos').value = item.hallazgos || '';
    $('itemNotes').value = item.notes || '';
    btnDelete.style.display = 'block';
  } else {
    $('modalTitle').textContent = 'Nuevo Elemento';
    if (btnPrint) btnPrint.style.display = 'none';
  }
  
  if (item) {
    showConditionalFields(item.category);
  } else {
    showConditionalFields();
  }
  
  modalOverlay.classList.add('active');
}
function closeModal() { modalOverlay.classList.remove('active'); }

btnNewItem.addEventListener('click', () => openModal());

// ===== Exportar a Excel (CSV) =====
const btnExportExcel = $('btnExportExcel');
if (btnExportExcel) {
  btnExportExcel.addEventListener('click', () => {
    const items = loadItems();
    if (items.length === 0) {
      showToast('No hay datos para exportar');
      return;
    }
    
    // Headers with BOM for Excel UTF-8 support
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "ID;Categoría;Título;Estado;Fecha Vencimiento;Responsable\r\n";
    
    items.forEach(item => {
      const id = item.id;
      const cat = item.category || '';
      const title = (item.title || '').replace(/"/g, '""');
      const status = item.status || '';
      const due = item.dueDate || '';
      const assignee = (item.assignee || '').replace(/"/g, '""');
      
      csvContent += `"${id}";"${cat}";"${title}";"${status}";"${due}";"${assignee}"\r\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Reporte_PrevRisk_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Reporte descargado exitosamente');
    addActivity('Se exportó el reporte semanal a Excel');
  });
}
modalClose.addEventListener('click', closeModal);
btnCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

function hideConditionalFields() {
  document.querySelectorAll('.conditional-field').forEach(f => f.style.display = 'none');
}
function showConditionalFields(cat) {
  hideConditionalFields();
  if (cat === 'capacitacion') $('fieldAsistentes').style.display = 'block';
  if (cat === 'documento') $('fieldDocType').style.display = 'block';
  if (cat === 'inspeccion') {
    $('fieldUbicacion').style.display = 'block';
    $('fieldHallazgos').style.display = 'block';
  }
}
$('itemCategory').addEventListener('change', e => showConditionalFields(e.target.value));

// ===== Save / Delete =====
btnSave.addEventListener('click', () => {
  const title = $('itemTitle').value.trim();
  const category = $('itemCategory').value;
  if (!title || !category) { showToast('Completa título y categoría', 'error'); return; }

  const items = loadItems();
  const id = $('itemId').value || genId();
  const isEdit = !!$('itemId').value;
  const data = {
    id, category, title,
    description: $('itemDescription').value.trim(),
    priority: $('itemPriority').value,
    status: $('itemStatus').value,
    dueDate: $('itemDueDate').value,
    assignee: $('itemAssignee').value.trim(),
    asistentes: $('itemAsistentes').value,
    docType: $('itemDocType').value,
    ubicacion: $('itemUbicacion').value.trim(),
    hallazgos: $('itemHallazgos').value,
    notes: $('itemNotes').value.trim(),
    createdAt: isEdit ? (items.find(i => i.id === id)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isEdit) {
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) items[idx] = data;
    addActivity(`Editado: <strong>${title}</strong>`);
  } else {
    items.push(data);
    addActivity(`Creado: <strong>${title}</strong>`);
  }

  saveItems(items);
  closeModal();
  showToast(isEdit ? 'Elemento actualizado' : 'Elemento creado');
  refreshAll();
});

btnDelete.addEventListener('click', () => {
  const id = $('itemId').value;
  if (!id) return;
  if (!confirm('¿Eliminar este elemento?')) return;
  let items = loadItems();
  const item = items.find(i => i.id === id);
  items = items.filter(i => i.id !== id);
  saveItems(items);
  if (item) addActivity(`Eliminado: <strong>${item.title}</strong>`);
  closeModal();
  showToast('Elemento eliminado');
  refreshAll();
});

const btnModalPrint = $('btnModalPrint');
if (btnModalPrint) {
  btnModalPrint.addEventListener('click', () => {
    document.body.classList.add('printing-general-modal');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-general-modal');
    }, 500);
  });
}

// ===== IndexedDB helper to get all files =====
function dbGetAllFiles() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve([]);
    const tx = db.transaction('files', 'readonly');
    const req = tx.objectStore('files').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

// ===== Autocomplete/Slide-out Search panel =====
const searchResultsPanel = $('searchResultsPanel');

// Global key down to close search panel on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && searchResultsPanel) {
    searchResultsPanel.classList.remove('active');
  }
});

// Close panel when clicking outside
document.addEventListener('click', e => {
  if (searchResultsPanel && !e.target.closest('.topbar-search')) {
    searchResultsPanel.classList.remove('active');
  }
});

if (globalSearch) {
  globalSearch.addEventListener('input', async () => {
    const q = globalSearch.value.toLowerCase().trim();
    
    // Also run standard filter on background tables
    refreshAll();

    if (!q) {
      if (searchResultsPanel) {
        searchResultsPanel.classList.remove('active');
        searchResultsPanel.innerHTML = '';
      }
      return;
    }

    // 1. Search in Dive Logs (Bitácoras)
    const allDives = loadDives();
    const matchedDives = allDives.filter(d => 
      d.buzo.toLowerCase().includes(q) ||
      (d.supervisor || '').toLowerCase().includes(q) ||
      (d.lugar || '').toLowerCase().includes(q) ||
      (d.matricula || '').toLowerCase().includes(q) ||
      (d.observaciones || '').toLowerCase().includes(q)
    );

    // 2. Search in general documents (prevrisk_items category === 'documento')
    const allItems = loadItems();
    const matchedGeneralDocs = allItems.filter(i => 
      i.category === 'documento' && (
        i.title.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.assignee || '').toLowerCase().includes(q)
      )
    );

    // 3. Search in all files loaded in IndexedDB
    const allDbFiles = await dbGetAllFiles();
    const matchedDbFiles = allDbFiles.filter(f => 
      f.fileName.toLowerCase().includes(q) ||
      (f.descripcion || '').toLowerCase().includes(q)
    );

    // Render results
    let html = '';
    let totalCount = matchedDives.length + matchedGeneralDocs.length + matchedDbFiles.length;

    if (totalCount === 0) {
      html = `<div class="search-no-results">No se encontraron resultados para "${globalSearch.value}"</div>`;
    } else {
      // A. Section: Bitácoras de Buceo
      if (matchedDives.length > 0) {
        html += `<div class="search-group-title">Bitácoras de Buceo (${matchedDives.length})</div>`;
        matchedDives.forEach(d => {
          const vesselText = d.matricula ? d.matricula : (d.lugar.toLowerCase().includes('aukan') ? 'Aukan' : (d.lugar.toLowerCase().includes('jose') ? 'María José' : d.lugar));
          const zoneText = d.zona === 'natales' ? 'Natales' : 'Aysén';
          const dateStr = formatDate(d.fecha);
          
          html += `
            <div class="search-result-item" onclick="openDiveLogFromResult('${d.id}')">
              <div class="result-icon" style="color: var(--accent);"><span class="material-icons-round">scuba_diving</span></div>
              <div class="result-details">
                <span class="result-title">Bitácora: ${d.buzo}</span>
                <span class="result-subtitle">
                  <span>Sup: ${d.supervisor || 'S/N'}</span> &bull; 
                  <span>${dateStr}</span> &bull;
                  <span class="result-vessel">${vesselText}</span>
                  <span class="result-zone">${zoneText}</span>
                </span>
              </div>
              <span class="result-badge" style="background: rgba(108, 92, 231, 0.1); color: var(--accent-light);">Bitácora</span>
            </div>
          `;
        });
      }

      // B. Section: Documentos del Sistema (prevrisk_items)
      if (matchedGeneralDocs.length > 0) {
        html += `<div class="search-group-title">Documentos del Sistema (${matchedGeneralDocs.length})</div>`;
        matchedGeneralDocs.forEach(doc => {
          const docLabels = { matriz:'Matriz', procedimiento:'PTS', acta:'Acta', informe:'Informe', checklist:'Checklist', odi_irl:'ODI/IRL', plan_emergencia:'Plan Emerg.', otro:'Otro' };
          const label = docLabels[doc.docType] || 'Documento';
          
          html += `
            <div class="search-result-item" onclick="openGeneralDocFromResult('${doc.id}')">
              <div class="result-icon" style="color: var(--info);"><span class="material-icons-round">description</span></div>
              <div class="result-details">
                <span class="result-title">${doc.title}</span>
                <span class="result-subtitle">Tipo: ${label} &bull; Estado: ${doc.status === 'completada' ? 'Completado' : 'Pendiente'}</span>
              </div>
              <span class="result-badge" style="background: rgba(116, 185, 255, 0.1); color: var(--info);">Documento</span>
            </div>
          `;
        });
      }

      // C. Section: Archivos Cargados (IndexedDB PDFs and Google Drive Links)
      if (matchedDbFiles.length > 0) {
        html += `<div class="search-group-title">Archivos y Enlaces Nube (${matchedDbFiles.length})</div>`;
        matchedDbFiles.forEach(f => {
          const isL = !!f.isLink;
          // Determine parent label (e.g. Aukan, María José, etc. using entityKey)
          const parentConfig = DETAIL_PAGES[f.entityKey];
          const parentName = parentConfig ? parentConfig.title : 'General';
          
          // Make beautiful clean name for parent name display
          let cleanParent = parentName;
          if (cleanParent.startsWith('Embarcación ')) {
            const boat = cleanParent.replace('Embarcación ', '');
            cleanParent = `<span class="result-vessel">${boat}</span>`;
          } else if (cleanParent.startsWith('Plan de Contingencia ')) {
            const plan = cleanParent.replace('Plan de Contingencia ', 'Plan ');
            cleanParent = `<span class="result-zone">${plan}</span>`;
          }

          const icon = isL ? 'cloud_queue' : 'insert_drive_file';
          const color = isL ? 'var(--warning)' : 'var(--success)';
          const fileLabel = isL ? 'Enlace' : 'PDF';

          html += `
            <div class="search-result-item" onclick="openFileFromResult('${f.id}')">
              <div class="result-icon" style="color: ${color};"><span class="material-icons-round">${icon}</span></div>
              <div class="result-details">
                <span class="result-title">${f.descripcion || f.fileName}</span>
                <span class="result-subtitle">
                  <span>${f.fileName}</span> &bull; 
                  <span>Asociado a: ${cleanParent}</span>
                </span>
              </div>
              <span class="result-badge" style="background: ${isL ? 'rgba(253, 203, 110, 0.1)' : 'rgba(0, 206, 201, 0.1)'}; color: ${color};">${fileLabel}</span>
            </div>
          `;
        });
      }
    }

    if (searchResultsPanel) {
      searchResultsPanel.innerHTML = html;
      searchResultsPanel.classList.add('active');
    }
  });
}

// Result Action functions
window.openDiveLogFromResult = function(id) {
  if (searchResultsPanel) searchResultsPanel.classList.remove('active');
  const allDives = loadDives();
  const dive = allDives.find(d => d.id === id);
  if (dive) {
    viewDiveDetail(dive);
  }
};

window.openFileFromResult = async function(id) {
  if (searchResultsPanel) searchResultsPanel.classList.remove('active');
  showToast('Abriendo archivo...', 'success');
  await downloadFile(id);
};

window.openGeneralDocFromResult = async function(id) {
  if (searchResultsPanel) searchResultsPanel.classList.remove('active');
  const items = loadItems();
  const item = items.find(i => i.id === id);
  if (!item) return;

  // Check if there is an uploaded file in IndexedDB under this item's ID
  const attachments = await dbGetFiles(id);
  if (attachments && attachments.length > 0) {
    showToast('Abriendo archivo adjunto...', 'success');
    await downloadFile(attachments[0].id);
  } else {
    // Otherwise open standard detail edit/view modal
    openModal(item);
  }
};

function filterItems(items) {
  const q = globalSearch.value.toLowerCase().trim();
  if (!q) return items;
  return items.filter(i =>
    i.title.toLowerCase().includes(q) ||
    (i.description || '').toLowerCase().includes(q) ||
    (i.assignee || '').toLowerCase().includes(q) ||
    (i.notes || '').toLowerCase().includes(q)
  );
}

function refreshAll() {
  const items = filterItems(loadItems());
  refreshDashboard(items);
  refreshKanban(items);
  refreshTable('capacitacion', 'capacitacionesBody', items);
  refreshTable('documento', 'documentosBody', items);
  refreshTable('inspeccion', 'inspeccionesBody', items);
  refreshCalendar(loadItems());
  refreshDiveLog();
  if (typeof refreshPersonal === 'function') refreshPersonal();
  if (typeof refreshAccidentes === 'function') refreshAccidentes();
  if (typeof refreshExtintores === 'function') refreshExtintores();
  if (typeof refreshEPP === 'function') refreshEPP();
  if (typeof refreshInvestigacion === 'function' && document.getElementById('view-investigacion')?.classList.contains('active')) refreshInvestigacion();
}

let myStatusChart = null;
let myAreaChart = null;

// ===== Dashboard =====
function refreshDashboard(items) {
  const all = loadItems();
  const pending = all.filter(i => i.status === 'pendiente').length;
  const progress = all.filter(i => i.status === 'en_progreso').length;
  const done = all.filter(i => i.status === 'completada').length;
  const today = new Date().toISOString().split('T')[0];
  const overdue = all.filter(i => i.status !== 'completada' && i.dueDate && i.dueDate < today).length;

  if ($('statPending')) $('statPending').textContent = pending;
  if ($('statProgress')) $('statProgress').textContent = progress;
  if ($('statDone')) $('statDone').textContent = done;
  if ($('statOverdue')) $('statOverdue').textContent = overdue;

  // Chart.js Status Donut
  const ctxStatus = document.getElementById('statusChart');
  if (ctxStatus && window.Chart) {
    if (myStatusChart) myStatusChart.destroy();
    
    // Check if there is data, otherwise show empty gray ring
    const hasData = (pending + progress + done) > 0;
    const chartData = hasData ? [pending, progress, done] : [1];
    const chartColors = hasData ? ['#eab308', '#38bdf8', '#22c55e'] : ['#27272a'];
    const chartLabels = hasData ? ['Pendientes', 'En Progreso', 'Completadas'] : ['Sin Datos'];

    myStatusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: chartLabels,
        datasets: [{
          data: chartData,
          backgroundColor: chartColors,
          borderWidth: 0,
          hoverOffset: hasData ? 4 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#71717a', font: { family: 'DM Sans', size: 11 } } },
          tooltip: { enabled: hasData }
        }
      }
    });
  }

  // Chart.js Area Bar
  const ctxArea = document.getElementById('areaChart');
  if (ctxArea && window.Chart) {
    const tareas = all.filter(i => i.category === 'tarea').length;
    const capacitaciones = all.filter(i => i.category === 'capacitacion').length;
    const documentos = all.filter(i => i.category === 'documento').length;
    
    if (myAreaChart) myAreaChart.destroy();
    myAreaChart = new Chart(ctxArea, {
      type: 'bar',
      data: {
        labels: ['Tareas', 'Capacitaciones', 'Documentos'],
        datasets: [{
          label: 'Total',
          data: [tareas, capacitaciones, documentos],
          backgroundColor: ['#8b5cf6', '#22c55e', '#38bdf8'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) { return ' ' + context.parsed.y + ' ítems'; }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          x: { ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }

  // Date
  const now = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  $('currentDate').textContent = now.toLocaleDateString('es-CL', opts);

  // Category bars
  const cats = [
    { key: 'tarea', label: 'Tareas', color: 'var(--accent)' },
    { key: 'capacitacion', label: 'Capacitaciones', color: 'var(--success)' },
    { key: 'documento', label: 'Documentos', color: 'var(--info)' },
    { key: 'inspeccion', label: 'Inspecciones', color: 'var(--warning)' }
  ];
  const maxCat = Math.max(...cats.map(c => all.filter(i => i.category === c.key).length), 1);
  $('categoryBars').innerHTML = cats.map(c => {
    const count = all.filter(i => i.category === c.key).length;
    const doneCount = all.filter(i => i.category === c.key && i.status === 'completada').length;
    const w = (count / maxCat) * 100;
    return `<div class="cat-bar-item">
      <label>${c.label} (${doneCount}/${count})</label>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${w}%;background:${c.color}"></div></div>
    </div>`;
  }).join('');

  // Upcoming
  const upcoming = all
    .filter(i => i.status !== 'completada' && i.dueDate && i.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6);
  $('upcomingList').innerHTML = upcoming.length ? upcoming.map(i => {
    const iconMap = { tarea: 'task_alt', capacitacion: 'school', documento: 'description', inspeccion: 'fact_check' };
    const colorMap = { tarea: 'var(--accent)', capacitacion: 'var(--success)', documento: 'var(--info)', inspeccion: 'var(--warning)' };
    return `<div class="upcoming-item" onclick="openModal(loadItems().find(x=>x.id==='${i.id}'))">
      <span class="material-icons-round upcoming-icon" style="color:${colorMap[i.category]}">${iconMap[i.category]}</span>
      <div class="upcoming-info">
        <div class="upcoming-title">${i.title}</div>
        <div class="upcoming-date">${formatDate(i.dueDate)}</div>
      </div>
      <span class="priority-badge priority-${i.priority}">${i.priority}</span>
    </div>`;
  }).join('') : '<div class="upcoming-empty"><span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem">event_available</span>No hay vencimientos próximos</div>';

  // Activity
  const activity = loadActivity().slice(0, 8);
  $('activityTimeline').innerHTML = activity.length ? activity.map(a => {
    const ago = timeAgo(new Date(a.time));
    return `<div class="activity-item">
      <span class="activity-dot"></span>
      <div><div class="activity-text">${a.text}</div><div class="activity-time">${ago}</div></div>
    </div>`;
  }).join('') : '<div class="upcoming-empty">Sin actividad reciente</div>';
}

// ===== Kanban =====
let currentFilter = 'all';
document.querySelectorAll('#view-tareas .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#view-tareas .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    refreshAll();
  });
});

function refreshKanban(items) {
  const taskItems = items.filter(i => currentFilter === 'all' || i.status === currentFilter);
  const statuses = ['pendiente', 'en_progreso', 'completada'];
  const containerIds = ['kanbanPendingCards', 'kanbanProgressCards', 'kanbanDoneCards'];
  const countIds = ['kanbanPending', 'kanbanProgress', 'kanbanDone'];

  statuses.forEach((s, idx) => {
    const filtered = taskItems.filter(i => i.status === s);
    $(countIds[idx]).textContent = filtered.length;
    $(containerIds[idx]).innerHTML = filtered.length ? filtered.map(i => `
      <div class="kanban-card" draggable="true" data-id="${i.id}" onclick="openModal(loadItems().find(x=>x.id==='${i.id}'))">
        <div class="kanban-card-title">${i.title}</div>
        ${i.description ? `<div class="kanban-card-desc">${i.description}</div>` : ''}
        <div class="kanban-card-footer">
          ${i.dueDate ? `<span class="kanban-card-date"><span class="material-icons-round">schedule</span>${formatDate(i.dueDate)}</span>` : '<span></span>'}
          <span class="priority-badge priority-${i.priority}">${i.priority}</span>
        </div>
      </div>
    `).join('') : '<div class="upcoming-empty" style="padding:1rem;font-size:.8rem">Sin elementos</div>';
  });
}

// ===== Tables =====
function refreshTable(category, bodyId, items) {
  const filtered = items.filter(i => i.category === category);
  const tbody = $(bodyId);
  if (!tbody) return;

  const statusLabel = { pendiente: 'Pendiente', en_progreso: 'En Progreso', completada: 'Completada' };
  const priorityLabel = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };

  if (category === 'capacitacion') {
    tbody.innerHTML = filtered.length ? filtered.map(i => `<tr>
      <td><strong>${i.title}</strong></td>
      <td>${i.dueDate ? formatDate(i.dueDate) : '—'}</td>
      <td>${i.asistentes || '—'}</td>
      <td><span class="status-badge status-${i.status}">${statusLabel[i.status]}</span></td>
      <td><span class="priority-badge priority-${i.priority}">${priorityLabel[i.priority]}</span></td>
      <td><div class="table-actions">
        <button onclick="openModal(loadItems().find(x=>x.id==='${i.id}'))" title="Editar"><span class="material-icons-round">edit</span></button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">No hay capacitaciones</td></tr>';
  } else if (category === 'documento') {
    const docLabels = { matriz:'Matriz', procedimiento:'PTS', acta:'Acta', informe:'Informe', checklist:'Checklist', odi_irl:'ODI/IRL', plan_emergencia:'Plan Emerg.', otro:'Otro' };
    tbody.innerHTML = filtered.length ? filtered.map(i => `<tr>
      <td><strong>${i.title}</strong></td>
      <td>${docLabels[i.docType] || '—'}</td>
      <td>${formatDate(i.createdAt?.split('T')[0])}</td>
      <td>${i.dueDate ? formatDate(i.dueDate) : '—'}</td>
      <td><span class="status-badge status-${i.status}">${statusLabel[i.status]}</span></td>
      <td><div class="table-actions">
        <button onclick="openModal(loadItems().find(x=>x.id==='${i.id}'))" title="Editar"><span class="material-icons-round">edit</span></button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">No hay documentos</td></tr>';
  } else if (category === 'inspeccion') {
    tbody.innerHTML = filtered.length ? filtered.map(i => `<tr>
      <td><strong>${i.title}</strong></td>
      <td>${i.ubicacion || '—'}</td>
      <td>${i.dueDate ? formatDate(i.dueDate) : '—'}</td>
      <td>${i.hallazgos || '—'}</td>
      <td><span class="status-badge status-${i.status}">${statusLabel[i.status]}</span></td>
      <td><div class="table-actions">
        <button onclick="openModal(loadItems().find(x=>x.id==='${i.id}'))" title="Editar"><span class="material-icons-round">edit</span></button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">No hay inspecciones</td></tr>';
  }
}

// ===== Calendar =====
let calDate = new Date();
const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

$('calPrev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); refreshCalendar(loadItems()); });
$('calNext').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); refreshCalendar(loadItems()); });

function refreshCalendar(allItems) {
  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  $('calMonthYear').textContent = `${monthNames[m]} ${y}`;

  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);
  let startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday start
  const daysInMonth = lastDay.getDate();
  const prevMonthLast = new Date(y, m, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  let html = '';
  // Previous month days
  for (let i = startDay - 1; i >= 0; i--) {
    html += `<div class="cal-day other-month"><span class="cal-day-num">${prevMonthLast - i}</span></div>`;
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const dayItems = allItems.filter(i => i.dueDate === dateStr);
    html += `<div class="cal-day${isToday ? ' today' : ''}">
      <span class="cal-day-num">${d}</span>
      ${dayItems.slice(0, 3).map(i => `<div class="cal-event cal-event-${i.category}" onclick="openModal(loadItems().find(x=>x.id==='${i.id}'))">${i.title}</div>`).join('')}
      ${dayItems.length > 3 ? `<div style="font-size:.65rem;color:var(--text-muted)">+${dayItems.length - 3} más</div>` : ''}
    </div>`;
  }
  // Next month fill
  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="cal-day other-month"><span class="cal-day-num">${d}</span></div>`;
  }
  $('calBody').innerHTML = html;
}

// ===== Helpers =====
function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}
function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Hace un momento';
  if (s < 3600) return `Hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Hace ${Math.floor(s / 3600)} hrs`;
  return `Hace ${Math.floor(s / 86400)} días`;
}

// ===== Seed Real Data =====
function seedDemoData() {
  if (loadItems().length > 0) return;
  const demo = [
    // === COMPLETADAS ===
    { id: genId(), category:'capacitacion', title:'Capacitación Hantavirus', description:'Prevención y control del Hantavirus - Comercial Lafquen Ltda. 10 asistentes.', priority:'alta', status:'completada', dueDate:'2026-05-11', assignee:'Bastian', asistentes:'10', notes:'Acta firmada y archivada', createdAt:'2026-05-10T10:00:00Z', updatedAt:'2026-05-11T20:00:00Z' },
    { id: genId(), category:'documento', title:'Matriz de Riesgo Buceo', description:'Matriz con 26 peligros identificados en operaciones de buceo. Revisada con jerarquía de controles (Eliminación, Sustitución, Ingeniería, Admin, EPP).', priority:'alta', status:'completada', dueDate:'2026-05-07', assignee:'Bastian', docType:'matriz', notes:'IRL reemplaza ODI. 26 riesgos evaluados.', createdAt:'2026-04-27T12:00:00Z', updatedAt:'2026-05-07T19:00:00Z' },
    { id: genId(), category:'documento', title:'Checklist Inspección Diaria', description:'Formulario de checklist para inspecciones de rutina diarias', priority:'baja', status:'completada', dueDate:'2026-05-05', assignee:'Bastian', docType:'checklist', createdAt:'2026-05-01T10:00:00Z', updatedAt:'2026-05-05T10:00:00Z' },

    // === PLANES DE EMERGENCIA ===
    { id: genId(), category:'documento', title:'Plan Emergencia Melinka', description:'Actualizar plan de emergencia de Melinka. FALTA SOLO LA MATRIZ.', priority:'alta', status:'en_progreso', dueDate:'2026-05-25', assignee:'Bastian', docType:'plan_emergencia', notes:'Falta solo completar la matriz de riesgos', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'documento', title:'Plan Emergencia Chacabuco', description:'Actualizar plan de emergencia completo para la base Chacabuco', priority:'alta', status:'pendiente', dueDate:'2026-06-10', assignee:'Bastian', docType:'plan_emergencia', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'documento', title:'Plan Emergencia Aguirre', description:'Actualizar plan de emergencia completo para la base Aguirre', priority:'alta', status:'pendiente', dueDate:'2026-06-15', assignee:'Bastian', docType:'plan_emergencia', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },

    // === RIOHS ===
    { id: genId(), category:'documento', title:'Actualizar RIOHS', description:'Reglamento Interno de Orden, Higiene y Seguridad. Requiere revisión y actualización completa.', priority:'alta', status:'pendiente', dueDate:'2026-06-20', assignee:'Bastian', docType:'otro', notes:'Documento normativo obligatorio', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },

    // === PROTOCOLOS MINSAL ===
    { id: genId(), category:'tarea', title:'Protocolo de Hiperbaria', description:'Implementar protocolo de vigilancia para trabajadores expuestos a condiciones hiperbáricas (buzos).', priority:'critica', status:'pendiente', dueDate:'2026-06-30', assignee:'Bastian', notes:'Obligatorio para operaciones de buceo comercial', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'tarea', title:'Protocolo PREXOR', description:'Implementar Protocolo de Exposición Ocupacional a Ruido. Evaluación de puestos de trabajo con exposición.', priority:'alta', status:'pendiente', dueDate:'2026-07-15', assignee:'Bastian', notes:'Protocolo MINSAL obligatorio', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'tarea', title:'Protocolo TMERT', description:'Implementar Protocolo de Trastornos Musculoesqueléticos. Identificación y evaluación de riesgos ergonómicos.', priority:'alta', status:'pendiente', dueDate:'2026-07-15', assignee:'Bastian', notes:'Protocolo MINSAL obligatorio', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'tarea', title:'Protocolo Psicosocial', description:'Implementar Protocolo de Riesgos Psicosociales en el trabajo. Aplicar cuestionario SUSESO/ISTAS 21.', priority:'alta', status:'pendiente', dueDate:'2026-07-30', assignee:'Bastian', notes:'Protocolo MINSAL obligatorio', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },

    // === MATRICES DE RIESGO ===
    { id: genId(), category:'documento', title:'Matriz de Riesgo - Baño de Peces', description:'Elaborar matriz de identificación de peligros y evaluación de riesgos para la tarea de baño de peces', priority:'alta', status:'pendiente', dueDate:'2026-06-15', assignee:'Bastian', docType:'matriz', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'documento', title:'Matriz de Riesgo - Varadero', description:'Elaborar matriz de riesgos para las operaciones del varadero', priority:'alta', status:'pendiente', dueDate:'2026-06-20', assignee:'Bastian', docType:'matriz', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'documento', title:'Matriz de Riesgo - Oficina', description:'Elaborar matriz de riesgos para trabajos de oficina', priority:'media', status:'pendiente', dueDate:'2026-06-25', assignee:'Bastian', docType:'matriz', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'documento', title:'Matriz de Riesgo - Cambio de Mallas', description:'Elaborar matriz de riesgos para la tarea de cambio de mallas en centros de cultivo', priority:'alta', status:'pendiente', dueDate:'2026-06-20', assignee:'Bastian', docType:'matriz', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },

    // === MAPAS DE RIESGO ===
    { id: genId(), category:'tarea', title:'Mapa de Riesgo - Oficina', description:'Implementar mapa de riesgos visual para las instalaciones de oficina', priority:'media', status:'pendiente', dueDate:'2026-06-30', assignee:'Bastian', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'tarea', title:'Mapa de Riesgo - Varadero', description:'Implementar mapa de riesgos visual para el área del varadero', priority:'alta', status:'pendiente', dueDate:'2026-06-30', assignee:'Bastian', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'tarea', title:'Mapa de Riesgo - Embarcaciones', description:'Implementar mapas de riesgo para cada embarcación de la flota', priority:'alta', status:'pendiente', dueDate:'2026-07-15', assignee:'Bastian', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },

    // === OTROS PENDIENTES ===
    { id: genId(), category:'tarea', title:'Actualizar ODI / IRL personal nuevo', description:'Generar IRL para trabajadores incorporados en mayo', priority:'alta', status:'pendiente', dueDate:'2026-05-20', assignee:'Bastian', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'documento', title:'PTS Operaciones de Buceo', description:'Procedimiento de trabajo seguro para inmersiones', priority:'critica', status:'en_progreso', dueDate:'2026-05-22', assignee:'Bastian', docType:'procedimiento', createdAt:'2026-05-10T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'capacitacion', title:'Charla Trabajo en Altura', description:'Capacitación sobre procedimientos seguros en trabajos en altura', priority:'media', status:'pendiente', dueDate:'2026-05-25', assignee:'Bastian', asistentes:'15', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'inspeccion', title:'Inspección EPP Bodega', description:'Verificar estado y vigencia de EPP almacenados en bodega central', priority:'media', status:'en_progreso', dueDate:'2026-05-18', assignee:'Bastian', ubicacion:'Bodega Central', hallazgos:'3', createdAt:'2026-05-12T09:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'capacitacion', title:'Inducción Riesgos Eléctricos', description:'Inducción para personal de mantención sobre riesgos eléctricos', priority:'media', status:'pendiente', dueDate:'2026-06-05', assignee:'Bastian', asistentes:'8', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
    { id: genId(), category:'inspeccion', title:'Inspección Extintores', description:'Verificar vigencia y estado de extintores en todas las áreas', priority:'alta', status:'pendiente', dueDate:'2026-05-28', assignee:'Bastian', ubicacion:'Todas las áreas', hallazgos:'0', createdAt:'2026-05-14T10:00:00Z', updatedAt:'2026-05-14T10:00:00Z' },
  ];
  saveItems(demo);
  addActivity('Dashboard inicializado con tareas reales de Prevención de Riesgos');
}

// ================================================================
// ===== BITÁCORAS DE BUCEO — Módulo Autónomo =====
// ================================================================

// DOM refs for dive modal
const diveModalOverlay = $('diveModalOverlay');
const diveModalClose = $('diveModalClose');
const diveBtnCancel = $('diveBtnCancel');
const diveBtnSave = $('diveBtnSave');
const diveBtnDelete = $('diveBtnDelete');
const btnNewDive = $('btnNewDive');

function openDiveModal(dive = null) {
  $('diveForm').reset();
  $('diveId').value = '';
  diveBtnDelete.style.display = 'none';
  if (dive) {
    $('diveModalTitle').innerHTML = '<span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem">scuba_diving</span>Editar Inmersión';
    $('diveId').value = dive.id;
    $('diveFecha').value = dive.fecha || '';
    $('diveHoraInicio').value = dive.horaInicio || '';
    $('diveHoraFin').value = dive.horaFin || '';
    $('diveBuzo').value = dive.buzo || '';
    $('diveSupervisor').value = dive.supervisor || '';
    $('diveLugar').value = dive.lugar || '';
    $('diveZona').value = dive.zona || 'aysen';
    $('diveTipo').value = dive.tipo || 'comercial';
    $('diveProfMax').value = dive.profMax || '';
    $('diveTiempoFondo').value = dive.tiempoFondo || '';
    $('diveTempAgua').value = dive.tempAgua || '';
    $('divePresionInicio').value = dive.presionInicio || '';
    $('divePresionFin').value = dive.presionFin || '';
    $('diveMezcla').value = dive.mezcla || 'aire';
    $('diveDescompresion').value = dive.descompresion || 'no';
    $('diveTabla').value = dive.tabla || 'na';
    $('diveParadaSeguridad').value = dive.paradaSeguridad || 'si';
    $('diveSaludPre').value = dive.saludPre || 'apto';
    $('diveSaludPost').value = dive.saludPost || 'normal';
    $('diveEquipo').value = dive.equipo || '';
    $('diveObservaciones').value = dive.observaciones || '';
    $('diveMatricula').value = dive.matricula || '';
    $('diveMatriculaEstado').value = dive.matriculaEstado || 'vigente';
    $('diveMatriculaVenc').value = dive.matriculaVenc || '';
    $('diveDescansoPost').value = dive.descansoPost || '';
    $('diveDescansoReq').value = dive.descansoReq || '';
    $('diveRitmoCardiaco').value = dive.ritmoCardiaco || '';
    $('diveDotacion').value = dive.dotacion || 'completa';
    $('diveDotacionDetalle').value = dive.dotacionDetalle || '';
    $('diveChecklistEquipo').value = dive.checklistEquipo || 'ok';
    diveBtnDelete.style.display = 'block';
  } else {
    $('diveModalTitle').innerHTML = '<span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem">scuba_diving</span>Nueva Inmersión';
    $('diveFecha').value = new Date().toISOString().split('T')[0];
  }
  diveModalOverlay.classList.add('active');
}
function closeDiveModal() { diveModalOverlay.classList.remove('active'); }

btnNewDive.addEventListener('click', () => openDiveModal());
diveModalClose.addEventListener('click', closeDiveModal);
diveBtnCancel.addEventListener('click', closeDiveModal);
diveModalOverlay.addEventListener('click', e => { if (e.target === diveModalOverlay) closeDiveModal(); });

diveBtnSave.addEventListener('click', () => {
  const buzo = $('diveBuzo').value.trim();
  const fecha = $('diveFecha').value;
  const lugar = $('diveLugar').value.trim();
  if (!buzo || !fecha || !lugar) { showToast('Completa buzo, fecha y lugar', 'error'); return; }

  const dives = loadDives();
  const id = $('diveId').value || genId();
  const isEdit = !!$('diveId').value;
  const data = {
    id, fecha, buzo, lugar,
    zona: $('diveZona').value,
    horaInicio: $('diveHoraInicio').value,
    horaFin: $('diveHoraFin').value,
    supervisor: $('diveSupervisor').value.trim(),
    tipo: $('diveTipo').value,
    profMax: parseFloat($('diveProfMax').value) || 0,
    tiempoFondo: parseInt($('diveTiempoFondo').value) || 0,
    tempAgua: parseFloat($('diveTempAgua').value) || null,
    presionInicio: parseInt($('divePresionInicio').value) || null,
    presionFin: parseInt($('divePresionFin').value) || null,
    mezcla: $('diveMezcla').value,
    descompresion: $('diveDescompresion').value,
    tabla: $('diveTabla').value,
    paradaSeguridad: $('diveParadaSeguridad').value,
    saludPre: $('diveSaludPre').value,
    saludPost: $('diveSaludPost').value,
    equipo: $('diveEquipo').value.trim(),
    observaciones: $('diveObservaciones').value.trim(),
    matricula: $('diveMatricula').value.trim(),
    matriculaEstado: $('diveMatriculaEstado').value,
    matriculaVenc: $('diveMatriculaVenc').value,
    descansoPost: $('diveDescansoPost').value.trim(),
    descansoReq: $('diveDescansoReq').value.trim(),
    ritmoCardiaco: parseInt($('diveRitmoCardiaco').value) || null,
    dotacion: $('diveDotacion').value,
    dotacionDetalle: $('diveDotacionDetalle').value.trim(),
    checklistEquipo: $('diveChecklistEquipo').value,
    createdAt: isEdit ? (dives.find(d => d.id === id)?.createdAt || new Date().toISOString()) : new Date().toISOString()
  };

  if (isEdit) {
    const idx = dives.findIndex(d => d.id === id);
    if (idx !== -1) dives[idx] = data;
    addActivity(`Bitácora editada: <strong>${buzo} - ${lugar}</strong>`);
  } else {
    dives.push(data);
    addActivity(`Bitácora registrada: <strong>${buzo} - ${lugar}</strong>`);
  }

  saveDives(dives);
  closeDiveModal();
  showToast(isEdit ? 'Bitácora actualizada' : 'Inmersión registrada');
  refreshDiveLog();
  refreshDashboard(filterItems(loadItems()));
});

diveBtnDelete.addEventListener('click', () => {
  const id = $('diveId').value;
  if (!id) return;
  if (!confirm('¿Eliminar esta bitácora?')) return;
  let dives = loadDives();
  const dive = dives.find(d => d.id === id);
  dives = dives.filter(d => d.id !== id);
  saveDives(dives);
  if (dive) addActivity(`Bitácora eliminada: <strong>${dive.buzo} - ${dive.lugar}</strong>`);
  closeDiveModal();
  showToast('Bitácora eliminada');
  refreshDiveLog();
});

let currentDiveZone = 'all';

// Wire up dive zone filter buttons
document.querySelectorAll('#diveZoneFilterGroup .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#diveZoneFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDiveZone = btn.dataset.zone;
    refreshDiveLog();
  });
});

// Wire up digital report modal close actions
$('diveReportModalClose').addEventListener('click', () => {
  $('diveReportModalOverlay').classList.remove('active');
});
$('diveReportModalOverlay').addEventListener('click', e => {
  if (e.target === $('diveReportModalOverlay')) {
    $('diveReportModalOverlay').classList.remove('active');
  }
});

function refreshDiveLog() {
  const allDives = loadDives();
  const tipoLabels = { comercial:'Comercial', industrial:'Industrial', cientifico:'Científico', rescate:'Rescate', inspeccion:'Inspección', mantenimiento:'Mantención', recreativo:'Recreativo' };

  // Filter dives by selected zone
  const dives = allDives.filter(d => currentDiveZone === 'all' || d.zona === currentDiveZone);

  // Stats
  $('diveTotalCount').textContent = dives.length;
  const maxD = dives.length ? Math.max(...dives.map(d => d.profMax || 0)) : 0;
  $('diveMaxDepth').textContent = maxD + 'm';
  const totalMin = dives.reduce((s, d) => s + (d.tiempoFondo || 0), 0);
  const totalH = totalMin >= 60 ? (totalMin / 60).toFixed(1) + 'h' : totalMin + 'min';
  $('diveTotalTime').textContent = totalH;
  const buzos = new Set(dives.map(d => d.buzo)).size;
  $('diveBuzosCount').textContent = buzos;

  // Table
  const tbody = $('diveTableBody');
  const sorted = [...dives].sort((a, b) => b.fecha.localeCompare(a.fecha));
  tbody.innerHTML = sorted.length ? sorted.map((d, idx) => `<tr>
    <td><strong>${sorted.length - idx}</strong></td>
    <td>${formatDate(d.fecha)}</td>
    <td>${d.buzo}</td>
    <td><span style="font-size: 0.8rem; font-weight: 600; color: var(--accent-light);">${d.zona === 'natales' ? 'Natales' : 'Aysén'}</span></td>
    <td>${d.lugar}</td>
    <td><strong>${d.profMax}m</strong></td>
    <td>${d.tiempoFondo} min</td>
    <td><span class="dive-type-badge dive-type-${d.tipo}">${tipoLabels[d.tipo] || d.tipo}</span></td>
    <td><span class="desco-badge desco-${d.descompresion}">${d.descompresion === 'si' ? 'Sí' : 'No'}</span></td>
    <td><div class="table-actions">
      <button onclick="openDiveModal(loadDives().find(x=>x.id==='${d.id}'))" title="Editar"><span class="material-icons-round">edit</span></button>
      <button onclick="viewDiveDetail(loadDives().find(x=>x.id==='${d.id}'))" title="Ver detalle"><span class="material-icons-round">visibility</span></button>
    </div></td>
  </tr>`).join('') : '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem"><span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem">scuba_diving</span>No hay bitácoras registradas en esta zona</td></tr>';
}

function viewDiveDetail(d) {
  if (!d) return;
  const tipoLabels = { comercial:'Comercial', industrial:'Industrial', cientifico:'Científico', rescate:'Rescate', inspeccion:'Inspección', mantenimiento:'Mantención', recreativo:'Recreativo' };
  const mezclaLabels = { aire:'Aire Comprimido', nitrox:'Nitrox (EANx)', trimix:'Trimix', heliox:'Heliox', oxigeno:'Oxígeno Puro' };
  const tablaLabels = { na:'N/A', us_navy:'US Navy', dciem:'DCIEM', buhlmann:'Bühlmann', rgbm:'RGBM', otra:'Otra' };
  const saludPreLabels = { apto:'Apto', observacion:'Apto con Observación', no_apto:'No Apto' };
  const saludPostLabels = { normal:'Normal', fatiga:'Fatiga Leve', sintomas:'Síntomas Reportados', emergencia:'Emergencia Médica' };
  
  const consumo = (d.presionInicio && d.presionFin) ? (d.presionInicio - d.presionFin) + ' bar' : '—';
  const folio = 'DIV-' + d.fecha.replace(/-/g, '') + '-' + d.id.slice(0, 4).toUpperCase();
  const zonaLabel = d.zona === 'natales' ? 'Puerto Natales' : 'Región de Aysén';

  const html = `
    <div class="premium-report">
      <!-- Header -->
      <div class="premium-report-header">
        <div class="premium-report-logo">
          <h4 class="premium-report-title">INFORME TÉCNICO DE INMERSIÓN</h4>
          <span class="premium-report-subtitle">Comercial Lafquen Ltda. &bull; Prevención de Riesgos</span>
        </div>
        <div class="premium-report-folio-box">
          <div class="premium-report-folio-label">N° FOLIO REGISTRO</div>
          <div class="premium-report-folio-val">${folio}</div>
        </div>
      </div>

      <!-- Info Bar -->
      <div class="premium-report-infobar">
        <div class="premium-report-infobar-item">
          <span class="premium-report-infobar-label">Fecha Operación</span>
          <strong class="premium-report-infobar-val">${formatDate(d.fecha)}</strong>
        </div>
        <div class="premium-report-infobar-item">
          <span class="premium-report-infobar-label">Horario Buceo</span>
          <strong class="premium-report-infobar-val">${d.horaInicio || '—'} - ${d.horaFin || '—'}</strong>
        </div>
        <div class="premium-report-infobar-item">
          <span class="premium-report-infobar-label">Zona Geográfica</span>
          <strong class="premium-report-infobar-val" style="color: var(--accent-light);">
            <span class="material-icons-round" style="font-size:0.95rem; vertical-align:middle; margin-right:3px;">place</span>${zonaLabel}
          </strong>
        </div>
      </div>

      <!-- Main Columns -->
      <div class="premium-report-columns">
        <!-- Col 1: Personal & Parámetros -->
        <div>
          <!-- Personal -->
          <div class="premium-report-section">
            <h5 class="premium-report-section-title">
              <span class="material-icons-round" style="color:var(--info); font-size:1.15rem;">badge</span> Personal & Rol
            </h5>
            <div class="premium-report-field-grid">
              <div class="premium-report-field">
                <span class="premium-report-field-label">Buzo Profesional:</span>
                <strong class="premium-report-field-val">${d.buzo}</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Matrícula:</span>
                <strong class="premium-report-field-val">
                  ${d.matricula || '—'} 
                  <span style="font-size:0.75rem;" class="status-badge status-${d.matriculaEstado === 'vigente' ? 'completada' : d.matriculaEstado === 'por_vencer' ? 'en_progreso' : 'pendiente'}">
                    ${d.matriculaEstado === 'vigente' ? 'Vigente' : d.matriculaEstado === 'por_vencer' ? 'Por Vencer' : 'Vencida'}
                  </span>
                </strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Supervisor:</span>
                <strong class="premium-report-field-val">${d.supervisor || '—'}</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Tipo Operación:</span>
                <strong class="premium-report-field-val">${tipoLabels[d.tipo] || d.tipo}</strong>
              </div>
            </div>
          </div>

          <!-- Parámetros -->
          <div class="premium-report-section">
            <h5 class="premium-report-section-title">
              <span class="material-icons-round" style="color:var(--accent-light); font-size:1.15rem;">query_stats</span> Parámetros Técnicos
            </h5>
            <div class="premium-report-field-grid">
              <div class="premium-report-field">
                <span class="premium-report-field-label">Profundidad Máxima:</span>
                <strong class="premium-report-field-val" style="color:var(--accent); font-size:0.95rem;">${d.profMax} metros</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Tiempo de Fondo:</span>
                <strong class="premium-report-field-val">${d.tiempoFondo} minutos</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Temperatura Agua:</span>
                <strong class="premium-report-field-val">${d.tempAgua !== null ? d.tempAgua + ' °C' : '—'}</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Mezcla / Gas:</span>
                <strong class="premium-report-field-val">${mezclaLabels[d.mezcla]}</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Consumo Presión:</span>
                <strong class="premium-report-field-val">${d.presionInicio || '—'} &rarr; ${d.presionFin || '—'} bar (${consumo})</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Col 2: Seguridad & Salud -->
        <div>
          <!-- Seguridad -->
          <div class="premium-report-section">
            <h5 class="premium-report-section-title">
              <span class="material-icons-round" style="color:var(--success); font-size:1.15rem;">gavel</span> Normativa & Descompresión
            </h5>
            <div class="premium-report-field-grid">
              <div class="premium-report-field">
                <span class="premium-report-field-label">¿Requiere Desco.?:</span>
                <strong class="premium-report-field-val">
                  <span class="status-badge status-${d.descompresion === 'si' ? 'pendiente' : 'completada'}">${d.descompresion === 'si' ? 'Sí' : 'No'}</span>
                </strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Tabla de Desco.:</span>
                <strong class="premium-report-field-val">${tablaLabels[d.tabla]}</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Parada de Seguridad:</span>
                <strong class="premium-report-field-val">
                  <span class="status-badge status-${d.paradaSeguridad === 'si' ? 'completada' : 'pendiente'}">${d.paradaSeguridad === 'si' ? 'OK' : 'No realizada'}</span>
                </strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Descanso Requerido:</span>
                <strong class="premium-report-field-val">${d.descansoReq || '—'}</strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Descanso Post-Buceo:</span>
                <strong class="premium-report-field-val">${d.descansoPost || '—'}</strong>
              </div>
            </div>
          </div>

          <!-- Salud -->
          <div class="premium-report-section">
            <h5 class="premium-report-section-title">
              <span class="material-icons-round" style="color:var(--warning); font-size:1.15rem;">monitor_heart</span> Salud & Equipamiento
            </h5>
            <div class="premium-report-field-grid">
              <div class="premium-report-field">
                <span class="premium-report-field-label">Estado Médico Pre-Buceo:</span>
                <strong class="premium-report-field-val">
                  <span class="status-badge status-${d.saludPre === 'apto' ? 'completada' : 'pendiente'}">${saludPreLabels[d.saludPre]}</span>
                </strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Estado Médico Post-Buceo:</span>
                <strong class="premium-report-field-val">
                  <span class="status-badge status-${d.saludPost === 'normal' ? 'completada' : d.saludPost === 'fatiga' ? 'en_progreso' : 'pendiente'}">${saludPostLabels[d.saludPost]}</span>
                </strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Checklist Equipamiento:</span>
                <strong class="premium-report-field-val">
                  <span class="status-badge status-${d.checklistEquipo === 'ok' ? 'completada' : 'pendiente'}">${d.checklistEquipo === 'ok' ? 'Aprobado OK' : 'Fallas'}</span>
                </strong>
              </div>
              <div class="premium-report-field">
                <span class="premium-report-field-label">Ritmo Cardíaco Promedio:</span>
                <strong class="premium-report-field-val">${d.ritmoCardiaco !== null ? d.ritmoCardiaco + ' lpm' : '—'}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Equipment Detail -->
      <div class="premium-report-full-section">
        <h5 class="premium-report-full-section-title">
          <span class="material-icons-round" style="color:var(--text-muted); font-size:1.15rem;">handyman</span> Equipamiento Utilizado
        </h5>
        <p class="premium-report-full-section-desc">${d.equipo || 'No se detalló equipamiento específico.'}</p>
      </div>

      <!-- Observations -->
      <div class="premium-report-full-section" style="margin-bottom: 2rem;">
        <h5 class="premium-report-full-section-title">
          <span class="material-icons-round" style="color:var(--text-muted); font-size:1.15rem;">sticky_note_2</span> Observaciones Adicionales
        </h5>
        <p class="premium-report-full-section-desc">${d.observaciones || 'Sin observaciones registradas para esta inmersión.'}</p>
      </div>

      <!-- Signatures (Visible on print) -->
      <div class="premium-report-signatures">
        <div class="premium-report-signature-box">
          <div style="height:50px;"></div>
          <div class="premium-report-signature-line">Firma del Buzo</div>
        </div>
        <div class="premium-report-signature-box">
          <div style="height:50px;"></div>
          <div class="premium-report-signature-line">Firma Supervisor / APR</div>
        </div>
      </div>
    </div>
  `;

  $('diveReportContent').innerHTML = html;
  $('diveReportModalOverlay').classList.add('active');
}

// ===== Seed Dive Demo Data =====
function seedDiveDemoData() {
  // Clear the pre-loaded demo divers to keep the registry clean initially
  if (!localStorage.getItem('prevrisk_dives_cleared_v1')) {
    localStorage.setItem(DIVE_KEY, JSON.stringify([]));
    localStorage.setItem('prevrisk_dives_cleared_v1', 'true');
    return;
  }
}

// ================================================================
// ===== DETAIL PAGES CONFIG =====
// ================================================================
const DETAIL_PAGES = {
  // Protocolos MINSAL
  'proto-hiperbaria': {
    title: 'Protocolo de Hiperbaria', subtitle: 'Vigilancia de trabajadores expuestos a condiciones hiperbáricas',
    icon: 'scuba_diving', color: 'var(--danger)',
    checklist: [
      'Identificar puestos con exposición hiperbárica',
      'Realizar evaluación médica pre-ocupacional a buzos',
      'Implementar programa de vigilancia de salud',
      'Establecer registros de inmersiones con tiempos y profundidades',
      'Capacitar a trabajadores sobre riesgos hiperbáricos',
      'Definir procedimientos de emergencia por enfermedad descompresiva',
      'Asegurar disponibilidad de cámara hiperbárica',
      'Realizar exámenes periódicos (audiometría, espirometría, neurológico)',
      'Mantener bitácoras de buceo actualizadas',
      'Informe anual a la autoridad sanitaria',
    ]
  },
  'proto-prexor': {
    title: 'Protocolo PREXOR', subtitle: 'Exposición Ocupacional a Ruido — Protocolo MINSAL',
    icon: 'hearing', color: 'var(--warning)',
    checklist: [
      'Identificar puestos de trabajo con exposición a ruido ≥82 dB(A)',
      'Realizar mediciones de ruido ambiental (mapa de ruido)',
      'Evaluar exposición personal con dosimetría',
      'Clasificar trabajadores según nivel de exposición',
      'Implementar medidas de control de ingeniería',
      'Proveer protección auditiva adecuada (EPA)',
      'Realizar audiometrías de base y seguimiento',
      'Capacitar sobre riesgos y uso correcto de EPA',
      'Señalizar áreas con ruido elevado',
      'Enviar informe semestral a SEREMI de Salud',
    ]
  },
  'proto-tmert': {
    title: 'Protocolo TMERT', subtitle: 'Trastornos Musculoesqueléticos — Protocolo MINSAL',
    icon: 'accessibility_new', color: 'var(--info)',
    checklist: [
      'Identificar puestos con factores de riesgo de TMERT',
      'Aplicar lista de chequeo TMERT-EESS inicial',
      'Evaluar nivel de riesgo (verde, amarillo, rojo)',
      'Implementar medidas correctivas para riesgo rojo/amarillo',
      'Realizar evaluación ergonómica detallada',
      'Capacitar a trabajadores en posturas y manejo de cargas',
      'Implementar pausas activas',
      'Realizar seguimiento y re-evaluación periódica',
      'Documentar todas las evaluaciones realizadas',
      'Informar resultados a Comité Paritario',
    ]
  },
  'proto-psicosocial': {
    title: 'Protocolo Psicosocial', subtitle: 'Riesgos Psicosociales en el Trabajo — SUSESO/ISTAS 21',
    icon: 'psychology', color: 'var(--success)',
    checklist: [
      'Conformar comité de aplicación del protocolo',
      'Difundir el protocolo a todos los trabajadores',
      'Aplicar cuestionario SUSESO/ISTAS 21 (versión breve)',
      'Analizar resultados por dimensión de riesgo',
      'Identificar dimensiones en riesgo alto',
      'Diseñar plan de intervención con medidas correctivas',
      'Implementar medidas del plan de intervención',
      'Re-evaluar con cuestionario post-intervención',
      'Documentar todo el proceso',
      'Enviar resultados a organismo administrador',
    ]
  },
  // Planes de Emergencia
  'plan-melinka': {
    title: 'Plan de Emergencia — Melinka', subtitle: 'Jurisdicción Melinka. Falta completar la matriz.',
    icon: 'emergency', color: 'var(--danger)', checklist: null
  },
  'plan-chacabuco': {
    title: 'Plan de Emergencia — Chacabuco', subtitle: 'Jurisdicción Chacabuco',
    icon: 'emergency', color: 'var(--warning)', checklist: null
  },
  'plan-aguirre': {
    title: 'Plan de Emergencia — Aguirre', subtitle: 'Jurisdicción Aguirre',
    icon: 'emergency', color: 'var(--info)', checklist: null
  },
  'plan-cisnes': {
    title: 'Plan de Emergencia — Puerto Cisnes', subtitle: 'Jurisdicción Puerto Cisnes',
    icon: 'emergency', color: 'var(--success)', checklist: null
  },
  // PTS
  'pts-list': {
    title: 'Procedimientos de Trabajo Seguro', subtitle: 'Todos los PTS vigentes de la operación',
    icon: 'engineering', color: 'var(--accent)', checklist: null
  },
  // Embarcaciones
  'emb-maria-jose': {
    title: 'Embarcación María José', subtitle: 'Estado: Activa',
    icon: 'directions_boat', color: 'var(--success)',
    checklist: ['Extintor vigente', 'Balsa salvavidas vigente', 'Bengalas vigentes', 'Plan emergencia hidrocarburos', 'Certificado navegabilidad', 'Radiobaliza EPIRB', 'Botiquín completo']
  },
  'emb-alvarito': {
    title: 'Embarcación Alvarito', subtitle: 'Estado: Activa',
    icon: 'directions_boat', color: 'var(--success)',
    checklist: ['Extintor vigente', 'Balsa salvavidas vigente', 'Bengalas vigentes', 'Plan emergencia hidrocarburos', 'Certificado navegabilidad', 'Radiobaliza EPIRB', 'Botiquín completo']
  },
  'emb-aukan': {
    title: 'Embarcación Aukan', subtitle: 'Estado: Activa',
    icon: 'directions_boat', color: 'var(--success)',
    checklist: ['Extintor vigente', 'Balsa salvavidas vigente', 'Bengalas vigentes', 'Plan emergencia hidrocarburos', 'Certificado navegabilidad', 'Radiobaliza EPIRB', 'Botiquín completo']
  },
  'emb-don-humberto': {
    title: 'Embarcación Don Humberto', subtitle: 'Estado: Parada',
    icon: 'directions_boat', color: 'var(--warning)',
    checklist: ['Extintor vigente', 'Balsa salvavidas vigente', 'Bengalas vigentes', 'Plan emergencia hidrocarburos', 'Certificado navegabilidad']
  },
  'emb-lafquen': {
    title: 'Embarcación Lafquen', subtitle: 'Estado: Parada',
    icon: 'directions_boat', color: 'var(--warning)',
    checklist: ['Extintor vigente', 'Balsa salvavidas vigente', 'Bengalas vigentes', 'Plan emergencia hidrocarburos', 'Certificado navegabilidad']
  },

  // ===== GESTIÓN SST =====
  'sst-politica': {
    title: 'Política SST', subtitle: 'Política de Seguridad y Salud en el Trabajo — Comercial Lafquen Ltda.',
    icon: 'policy', color: 'var(--accent)', checklist: null
  },
  'sst-programa': {
    title: 'Programa Preventivo 2026', subtitle: 'Programa de Trabajo Preventivo + Carta Gantt de actividades',
    icon: 'event_note', color: 'var(--info)',
    checklist: ['Programa aprobado y difundido', 'Carta Gantt con cronograma mensual', 'Actividades de capacitación programadas', 'Inspecciones planificadas', 'Simulacros de emergencia', 'Revisión de protocolos MINSAL', 'Seguimiento de accidentabilidad', 'Informe trimestral a gerencia']
  },
  'sst-carta-gantt': {
    title: 'Carta Gantt 2026', subtitle: 'Cronograma de actividades preventivas mensuales',
    icon: 'timeline', color: 'var(--warning)', checklist: null
  },
  'sst-apr': {
    title: 'APR / Encargado PRL', subtitle: 'Registro de encargado de Prevención de Riesgos Laborales',
    icon: 'badge', color: 'var(--success)', checklist: null
  },
  'sst-delegados': {
    title: 'Delegados SST', subtitle: 'Delegados de Seguridad y Salud en el Trabajo por embarcación',
    icon: 'groups', color: 'var(--info)', checklist: null
  },

  // ===== MIPER =====
  'miper-2026': {
    title: 'MIPER 2026', subtitle: 'Matriz de Identificación de Peligros y Evaluación de Riesgos — Versión 2026',
    icon: 'grid_on', color: 'var(--danger)',
    checklist: ['Identificación de todos los procesos', 'Levantamiento de peligros por proceso', 'Evaluación de probabilidad y consecuencia', 'Determinación de nivel de riesgo', 'Definición de controles por jerarquía', 'Validación con trabajadores', 'Aprobación por gerencia', 'Difusión a todo el personal']
  },
  'miper-procedimiento': {
    title: 'Procedimiento MIPER', subtitle: 'Procedimiento para la identificación de peligros y evaluación de riesgos',
    icon: 'description', color: 'var(--accent)', checklist: null
  },

  // ===== IRL POR CARGO =====
  'irl-buzos': {
    title: 'IRL — Buzos Básicos', subtitle: 'Instrucción de Riesgos Laborales para cargo de Buzo Básico',
    icon: 'scuba_diving', color: 'var(--info)', checklist: null
  },
  'irl-capitan': {
    title: 'IRL — Capitán', subtitle: 'Instrucción de Riesgos Laborales para cargo de Capitán',
    icon: 'anchor', color: 'var(--accent)', checklist: null
  },
  'irl-cocinero': {
    title: 'IRL — Cocinero', subtitle: 'Instrucción de Riesgos Laborales para cargo de Cocinero',
    icon: 'restaurant', color: 'var(--warning)', checklist: null
  },
  'irl-motorista': {
    title: 'IRL — Motorista', subtitle: 'Instrucción de Riesgos Laborales para cargo de Motorista',
    icon: 'settings', color: 'var(--success)', checklist: null
  },
  'irl-operario': {
    title: 'IRL — Operario', subtitle: 'Instrucción de Riesgos Laborales para cargo de Operario',
    icon: 'construction', color: 'var(--danger)', checklist: null
  },
  'irl-supervisor': {
    title: 'IRL — Supervisor de Buceo', subtitle: 'Instrucción de Riesgos Laborales para cargo de Supervisor de Buceo',
    icon: 'supervisor_account', color: 'var(--accent)', checklist: null
  },
  'irl-tripulante': {
    title: 'IRL — Tripulante', subtitle: 'Instrucción de Riesgos Laborales para cargo de Tripulante',
    icon: 'person', color: 'var(--info)', checklist: null
  },
  'irl-natales': {
    title: 'IRL — Natales', subtitle: '16 IRL individuales de trabajadores en Puerto Natales',
    icon: 'location_on', color: 'var(--warning)', checklist: null
  },

  // ===== LEGAL Y NORMATIVO =====
  'riohs': {
    title: 'RIOHS', subtitle: 'Reglamento Interno de Orden, Higiene y Seguridad',
    icon: 'gavel', color: 'var(--accent)',
    checklist: ['Revisión y actualización del RIOHS', 'Aprobación por SEREMI del Trabajo', 'Difusión a todos los trabajadores', 'Entrega documentada con firma', 'Publicación en lugares visibles', 'Actualización con cambios normativos']
  },
  'karin-protocolo': {
    title: 'Ley Karin — Protocolo Acoso', subtitle: 'Protocolo de acoso laboral y/o sexual o violencia en el trabajo',
    icon: 'security', color: 'var(--danger)', checklist: null
  },
  'karin-procedimiento': {
    title: 'Ley Karin — Proc. Investigación', subtitle: 'Procedimiento de investigación y actuación ante denuncias',
    icon: 'search', color: 'var(--warning)', checklist: null
  },
  'karin-politica': {
    title: 'Ley Karin — Política Prevención', subtitle: 'Política de prevención frente al acoso laboral',
    icon: 'shield', color: 'var(--success)', checklist: null
  },
  'karin-formatos': {
    title: 'Ley Karin — Formatos e Instructivos', subtitle: 'Formatos de denuncia y material instructivo',
    icon: 'article', color: 'var(--info)', checklist: null
  },

  // ===== ACCIDENTES =====
  'acc-estadisticas': {
    title: 'Estadísticas Accidentabilidad 2026', subtitle: 'Estadísticas mensuales de accidentabilidad',
    icon: 'analytics', color: 'var(--danger)', checklist: null
  },
  'acc-nomina': {
    title: 'Nómina Accidentes 2026', subtitle: 'Registro de accidentes del período 2026',
    icon: 'list_alt', color: 'var(--warning)', checklist: null
  },
  'acc-procedimiento': {
    title: 'Procedimiento ante Accidente', subtitle: 'Procedimiento de acción ante accidente laboral 2026',
    icon: 'emergency', color: 'var(--danger)',
    checklist: ['Primeros auxilios inmediatos', 'Notificación al supervisor', 'Traslado a centro asistencial', 'Denuncia Individual de Accidente (DIAT)', 'Investigación del accidente', 'Identificación de causas raíz', 'Definición de medidas correctivas', 'Seguimiento de implementación']
  },
  // ===== PLANES EMERGENCIA EMBARCACIONES =====
  'pemb-maria-jose': {
    title: 'Plan Emergencia — María José', subtitle: 'Plan de emergencia + Resolución + Plan Hidrocarburos + Carta Conductora',
    icon: 'sailing', color: 'var(--success)', checklist: null
  },
  'pemb-aukan': {
    title: 'Plan Emergencia — Aukan', subtitle: 'Planes de emergencia de la embarcación Aukan',
    icon: 'sailing', color: 'var(--info)', checklist: null
  },

  // ===== PLANES CONTINGENCIA BUCEO =====
  'plan-natales': {
    title: 'Plan de Emergencia — Natales', subtitle: 'Jurisdicción Puerto Natales',
    icon: 'emergency', color: 'var(--accent)', checklist: null
  },

  // ===== PTS ESPECÍFICOS =====
  'pts-banos': {
    title: 'PTS — Baños de Peces', subtitle: 'Procedimiento de Trabajo Seguro para operaciones de baño 2026',
    icon: 'water', color: 'var(--info)', checklist: null
  },
  'pts-tensores': {
    title: 'PTS — Instalación de Tensores', subtitle: 'PTS para instalación de tensores a redes peceras y loberas 2026',
    icon: 'link', color: 'var(--warning)', checklist: null
  },

  // ===== DOCUMENTACIÓN =====
  'cartas-recepcionadas': {
    title: 'Cartas Conductoras Recepcionadas', subtitle: '8 cartas conductoras de planes de emergencia y buceo',
    icon: 'mark_email_read', color: 'var(--success)', checklist: null
  },
  'cartas-formatos': {
    title: 'Formato Cartas Conductoras', subtitle: 'Plantillas y formatos para cartas conductoras',
    icon: 'drafts', color: 'var(--accent)', checklist: null
  },
  'extintores': {
    title: 'Extintores', subtitle: 'Control de vigencia y estado de extintores en todas las áreas',
    icon: 'fire_extinguisher', color: 'var(--danger)',
    checklist: ['Inventario actualizado de extintores', 'Verificación de fecha de vencimiento', 'Inspección visual mensual', 'Mantenimiento anual certificado', 'Señalización correcta', 'Accesibilidad sin obstrucciones', 'Registro fotográfico']
  },
  'epp': {
    title: 'Certificaciones EPP', subtitle: 'Control de equipos de protección personal y certificaciones',
    icon: 'security', color: 'var(--info)',
    checklist: ['Inventario de EPP por trabajador', 'Verificación de certificaciones vigentes', 'Registro de entrega documentada', 'Capacitación en uso correcto', 'Inspección periódica de estado', 'Reposición de EPP deteriorado']
  },

  // ===== ADMINISTRACIÓN =====
  'formatos': {
    title: 'Formatos / Bitácora 2026', subtitle: 'Orden de recepción de servicios y formatos operacionales',
    icon: 'content_copy', color: 'var(--info)', checklist: null
  },


  // ===== EXÁMENES =====
  'examenes': {
    title: 'Exámenes Ocupacionales', subtitle: 'Control de fechas y vigencia de exámenes ocupacionales de buzos y trabajadores',
    icon: 'health_and_safety', color: 'var(--danger)',
    checklist: ['Listado actualizado de trabajadores', 'Fechas de último examen registradas', 'Alertas de vencimiento configuradas', 'Coordinación con centro médico', 'Archivo de certificados']
  },
};

// ===== Checklist & Notes Persistence =====
const CHECKLIST_KEY = 'prevrisk_checklists';
const NOTES_KEY = 'prevrisk_notes';

function loadChecklists() { try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY)) || {}; } catch { return {}; } }
function saveChecklists(data) {
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(data));
  cloudSave('store/checklists', data);
}
function loadNotes() { try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch { return {}; } }
function saveNotes(data) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(data));
  cloudSave('store/notes', data);
}

// ===== Render Detail Page =====
async function renderDetailPage(key, config) {
  $('detailTitle').innerHTML = `<span class="material-icons-round" style="vertical-align:middle;margin-right:.5rem;color:${config.color}">${config.icon}</span>${config.title}`;
  $('detailSubtitle').textContent = config.subtitle || '';

  // Stats
  const files = await dbGetFiles(key);
  const today = new Date().toISOString().split('T')[0];
  const vigentes = files.filter(f => !f.vencimiento || f.vencimiento >= today).length;
  const vencidos = files.filter(f => f.vencimiento && f.vencimiento < today).length;

  $('detailStats').innerHTML = `
    <div class="stat-card" style="border-left:3px solid var(--info)">
      <div class="stat-icon" style="background:rgba(116,185,255,.12);color:var(--info)"><span class="material-icons-round">folder</span></div>
      <div class="stat-info"><span class="stat-value">${files.length}</span><span class="stat-label">Documentos</span></div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--success)">
      <div class="stat-icon" style="background:rgba(0,206,201,.12);color:var(--success)"><span class="material-icons-round">verified</span></div>
      <div class="stat-info"><span class="stat-value">${vigentes}</span><span class="stat-label">Vigentes</span></div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--danger)">
      <div class="stat-icon" style="background:rgba(255,118,117,.12);color:var(--danger)"><span class="material-icons-round">warning</span></div>
      <div class="stat-info"><span class="stat-value">${vencidos}</span><span class="stat-label">Vencidos</span></div>
    </div>
  `;

  // Checklist
  const checkPanel = $('detailChecklistPanel');
  if (config.checklist && config.checklist.length) {
    checkPanel.style.display = 'block';
    const allChecks = loadChecklists();
    const checks = allChecks[key] || {};
    const done = config.checklist.filter((_, i) => checks[i]).length;
    $('detailChecklistProgress').textContent = `${done}/${config.checklist.length} completados`;
    $('detailChecklist').innerHTML = config.checklist.map((item, i) => {
      const checked = checks[i] ? 'checked' : '';
      const doneClass = checks[i] ? ' done' : '';
      return `<div class="checklist-item${doneClass}">
        <input type="checkbox" id="check_${i}" ${checked} onchange="toggleCheck('${key}',${i},this.checked)">
        <label for="check_${i}">${item}</label>
      </div>`;
    }).join('');
  } else {
    checkPanel.style.display = 'none';
  }

  // Occupational Exams Excel (Only for key === 'examenes')
  const excelPanel = $('detailExamenesExcelPanel');
  if (excelPanel) {
    if (key === 'examenes') {
      excelPanel.style.display = 'block';
      loadExamenesExcel();
    } else {
      excelPanel.style.display = 'none';
    }
  }

  // Files table
  renderFileTable(key, files);

  // Notes
  const notes = loadNotes();
  $('detailNotes').value = notes[key] || '';
}

async function loadExamenesExcel() {
  const container = $('detailExamenesBody');
  if (!container) return;

  const todoPersonal = loadPersonal();
  if (!todoPersonal || todoPersonal.length === 0) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin registros.</td></tr>`;
    return;
  }

  // Solo buzos y supervisores de buceo
  const personal = todoPersonal.filter(p => {
    const rol = (p.rol || '').toLowerCase();
    return rol.includes('buzo') || (rol.includes('supervisor') && rol.includes('buceo'));
  });

  const today = new Date().toISOString().split('T')[0];
  if ($('detailExamenesCount')) $('detailExamenesCount').textContent = `${personal.length} buzos y supervisores registrados`;

  // Agrupar por zona
  const zonas = {};
  personal.forEach(p => {
    const zona = p.zona || 'Sin Zona';
    if (!zonas[zona]) zonas[zona] = [];
    zonas[zona].push(p);
  });

  const zonaColors = {
    'Zona Aysén': { bg: 'rgba(91,138,240,.12)', color: 'var(--accent-light)', icon: 'anchor' },
    'Zona Natales': { bg: 'rgba(16,217,240,.12)', color: 'var(--info)', icon: 'water' },
  };

  function getEstado(p) {
    const venc = p.vencExamen || p.vencMatricula || null;
    if (!venc) return { cls: 'doc-sin-venc', txt: 'Sin fecha' };
    if (venc < today) return { cls: 'doc-vencido', txt: 'Vencido' };
    const diff = Math.ceil((new Date(venc) - new Date(today)) / 86400000);
    if (diff <= 60) return { cls: 'doc-por-vencer', txt: `Vence en ${diff}d` };
    return { cls: 'doc-vigente', txt: 'Vigente' };
  }

  // Construir HTML con secciones por zona
  let html = '';
  Object.entries(zonas).forEach(([zona, trabajadores]) => {
    const zc = zonaColors[zona] || { bg: 'rgba(139,149,176,.1)', color: 'var(--text-secondary)', icon: 'place' };
    const vencidos = trabajadores.filter(p => { const e = getEstado(p); return e.cls === 'doc-vencido'; }).length;
    const porVencer = trabajadores.filter(p => { const e = getEstado(p); return e.cls === 'doc-por-vencer'; }).length;

    html += `
      <tr>
        <td colspan="8" style="padding:0;border:none">
          <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:${zc.bg};border-bottom:2px solid ${zc.color};margin-top:.5rem">
            <span class="material-icons-round" style="color:${zc.color};font-size:1.2rem">${zc.icon}</span>
            <strong style="font-size:.9rem;color:${zc.color}">${zona}</strong>
            <span style="font-size:.75rem;color:var(--text-muted)">${trabajadores.length} trabajadores</span>
            ${vencidos > 0 ? `<span style="background:rgba(240,91,122,.15);color:var(--danger);font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px">⚠️ ${vencidos} vencido(s)</span>` : ''}
            ${porVencer > 0 ? `<span style="background:rgba(245,166,35,.15);color:var(--warning);font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px">⏰ ${porVencer} por vencer</span>` : ''}
          </div>
        </td>
      </tr>`;

    trabajadores.forEach(p => {
      const estado = getEstado(p);
      const driveLinks = JSON.parse(localStorage.getItem('prevrisk_examen_drive_' + p.id) || '{}');
      const tieneDoc = driveLinks.url ? true : false;

      html += `<tr style="cursor:pointer" onclick="abrirFichaExamen('${p.id}')" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
        <td>
          <div style="display:flex;align-items:center;gap:.6rem">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#7c5bf5);display:grid;place-items:center;color:#fff;font-weight:800;font-size:.72rem;flex-shrink:0">
              ${p.nombre.split(' ').map(w=>w[0]).slice(0,2).join('')}
            </div>
            <div>
              <div style="font-weight:700;font-size:.83rem">${p.nombre}</div>
              <div style="font-size:.7rem;color:var(--text-muted)">${p.rut || ''}</div>
            </div>
          </div>
        </td>
        <td><span class="priority-badge priority-${p.rol?.includes('Supervisor')?'alta':'media'}" style="font-size:.7rem">${p.rol || 'Buzo Básico'}</span></td>
        <td style="font-size:.82rem;font-weight:${p.vencExamen?'600':'400'};color:${p.vencExamen && p.vencExamen < today?'var(--danger)':p.vencExamen?'var(--text-primary)':'var(--text-muted)'}">${p.vencExamen ? formatDate(p.vencExamen) : '—'}</td>
        <td style="font-size:.82rem;color:${p.vencMatricula && p.vencMatricula < today?'var(--danger)':p.vencMatricula?'var(--text-primary)':'var(--text-muted)'}">${p.vencMatricula ? formatDate(p.vencMatricula) : '—'}</td>
        <td><span class="doc-status ${estado.cls}">${estado.txt}</span></td>
        <td>
          ${tieneDoc
            ? `<a href="${driveLinks.url}" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:.3rem;color:var(--accent-light);font-size:.78rem;font-weight:600;text-decoration:none;background:var(--accent-glow);padding:.25rem .6rem;border-radius:6px" title="${driveLinks.desc||'Ver documento'}">
                <span class="material-icons-round" style="font-size:.95rem">folder_open</span> Ver Examen
              </a>`
            : `<span style="font-size:.75rem;color:var(--text-muted)">Sin documento</span>`
          }
        </td>
        <td style="font-size:.78rem;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.notas || '—'}</td>
        <td>
          <button onclick="event.stopPropagation();abrirFichaExamen('${p.id}')" class="btn-icon" title="Abrir ficha">
            <span class="material-icons-round" style="font-size:1rem">edit</span>
          </button>
        </td>
      </tr>`;
    });
  });

  container.innerHTML = html;
}

// Abrir ficha de trabajador con link Google Drive
function abrirFichaExamen(personaId) {
  const personal = loadPersonal();
  const p = personal.find(x => x.id === personaId);
  if (!p) return;

  const today = new Date().toISOString().split('T')[0];
  const driveLinks = JSON.parse(localStorage.getItem('prevrisk_examen_drive_' + personaId) || '{}');

  // Título
  const title = document.getElementById('fichaExamenTitle');
  if (title) title.innerHTML = `<span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;color:var(--accent)">person</span>${p.nombre}`;

  // Info general
  const info = document.getElementById('fichaExamenInfo');
  if (info) info.innerHTML = [
    ['Nombre', p.nombre],
    ['RUT', p.rut || '—'],
    ['Cargo', p.rol || '—'],
    ['Zona', p.zona || '—'],
  ].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--border);font-size:.82rem">
    <span style="color:var(--text-muted)">${k}</span>
    <span style="font-weight:600">${v}</span>
  </div>`).join('');

  // Vigencias
  const vig = document.getElementById('fichaExamenVigencias');
  if (vig) {
    const vencOcup = p.vencExamen;
    const vencMar = p.vencMatricula;
    const colorOcup = vencOcup ? (vencOcup < today ? 'var(--danger)' : 'var(--success)') : 'var(--text-muted)';
    const colorMar = vencMar ? (vencMar < today ? 'var(--danger)' : 'var(--success)') : 'var(--text-muted)';
    vig.innerHTML = `
      <div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--border);font-size:.82rem">
        <span style="color:var(--text-muted)">Vigencia Ocupacional</span>
        <span style="font-weight:700;color:${colorOcup}">${vencOcup ? formatDate(vencOcup) : '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--border);font-size:.82rem">
        <span style="color:var(--text-muted)">Vigencia Alta Mar</span>
        <span style="font-weight:700;color:${colorMar}">${vencMar ? formatDate(vencMar) : '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:.3rem 0;font-size:.82rem">
        <span style="color:var(--text-muted)">Notas</span>
        <span style="font-size:.75rem;color:var(--text-secondary);text-align:right;max-width:60%">${p.notas || '—'}</span>
      </div>`;
  }

  // Drive
  const urlInput = document.getElementById('fichaExamenDriveUrl');
  const descInput = document.getElementById('fichaExamenDriveDesc');
  const driveBtn = document.getElementById('fichaExamenDriveBtn');
  const idInput = document.getElementById('fichaExamenId');
  const notasInput = document.getElementById('fichaExamenNotas');

  if (urlInput) urlInput.value = driveLinks.url || '';
  if (descInput) descInput.value = driveLinks.desc || '';
  if (notasInput) notasInput.value = p.notas || '';
  if (idInput) idInput.value = personaId;

  // Mostrar botón abrir si hay URL
  if (driveBtn) {
    if (driveLinks.url) {
      driveBtn.href = driveLinks.url;
      driveBtn.style.display = 'flex';
    } else {
      driveBtn.style.display = 'none';
    }
  }

  // Actualizar botón al escribir URL
  if (urlInput) {
    urlInput.oninput = () => {
      if (driveBtn) {
        if (urlInput.value.trim()) {
          driveBtn.href = urlInput.value.trim();
          driveBtn.style.display = 'flex';
        } else {
          driveBtn.style.display = 'none';
        }
      }
    };
  }

  document.getElementById('fichaExamenOverlay')?.classList.add('active');
}

function guardarFichaExamen() {
  const personaId = document.getElementById('fichaExamenId')?.value;
  if (!personaId) return;

  const url = document.getElementById('fichaExamenDriveUrl')?.value.trim() || '';
  const desc = document.getElementById('fichaExamenDriveDesc')?.value.trim() || '';
  const notas = document.getElementById('fichaExamenNotas')?.value.trim() || '';

  // Guardar link Drive
  if (url) {
    localStorage.setItem('prevrisk_examen_drive_' + personaId, JSON.stringify({ url, desc }));
  } else {
    localStorage.removeItem('prevrisk_examen_drive_' + personaId);
  }

  // Actualizar notas en el personal
  const personal = loadPersonal();
  const idx = personal.findIndex(p => p.id === personaId);
  if (idx >= 0) {
    personal[idx].notas = notas;
    savePersonal(personal);
  }

  document.getElementById('fichaExamenOverlay')?.classList.remove('active');
  showToast('Ficha guardada ✓');
  loadExamenesExcel();
}

window.abrirFichaExamen = abrirFichaExamen;

// Eventos modal ficha examen
document.addEventListener('DOMContentLoaded', () => {
  const ov = document.getElementById('fichaExamenOverlay');
  if (!ov) return;
  document.getElementById('fichaExamenClose')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('fichaExamenCancel')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('fichaExamenSave')?.addEventListener('click', guardarFichaExamen);
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); });
});

function toggleCheck(key, idx, val) {
  const all = loadChecklists();
  if (!all[key]) all[key] = {};
  all[key][idx] = val;
  saveChecklists(all);
  // Update progress text
  const config = DETAIL_PAGES[key];
  if (config && config.checklist) {
    const done = config.checklist.filter((_, i) => all[key][i]).length;
    $('detailChecklistProgress').textContent = `${done}/${config.checklist.length} completados`;
    // Toggle done class on parent
    const item = document.getElementById('check_' + idx)?.closest('.checklist-item');
    if (item) item.classList.toggle('done', val);
  }
}

// Save notes
$('btnSaveNotes').addEventListener('click', () => {
  if (!currentDetailKey) return;
  const notes = loadNotes();
  notes[currentDetailKey] = $('detailNotes').value;
  saveNotes(notes);
  showToast('Notas guardadas');
});

function renderFileTable(key, files) {
  const today = new Date().toISOString().split('T')[0];
  const tbody = $('detailFilesBody');
  tbody.innerHTML = files.length ? files.map(f => {
    const isL = !!f.isLink;
    const sizeStr = isL ? '—' : (f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : (f.size / 1024).toFixed(0) + ' KB');
    let ext = 'DRIVE';
    let extColor = 'var(--success)';
    if (!isL) {
      ext = f.fileName.split('.').pop().toUpperCase();
      extColor = 'var(--text-muted)';
    }
    let statusClass = 'doc-sin-venc', statusText = 'Sin venc.';
    if (f.vencimiento) {
      if (f.vencimiento < today) { statusClass = 'doc-vencido'; statusText = 'Vencido'; }
      else {
        const diff = Math.ceil((new Date(f.vencimiento) - new Date(today)) / 86400000);
        if (diff <= 30) { statusClass = 'doc-por-vencer'; statusText = `${diff}d restantes`; }
        else { statusClass = 'doc-vigente'; statusText = 'Vigente'; }
      }
    }
    const actTitle = isL ? 'Abrir Enlace' : 'Descargar';
    return `<tr>
      <td>
        <a href="#" onclick="downloadFile('${f.id}'); return false;" title="${actTitle}" style="color:var(--text); text-decoration:none; cursor:pointer; font-weight:600; display:inline-block; transition:color 0.2s ease;" onmouseover="this.style.color='var(--accent-light)';this.style.textDecoration='underline'" onmouseout="this.style.color='var(--text)';this.style.textDecoration='none'">
          ${f.descripcion || f.fileName}
        </a>
        <br><span style="font-size:.72rem;color:var(--text-muted)">${isL ? 'Enlace a Google Drive' : f.fileName}</span>
      </td>
      <td><span class="priority-badge" style="background:rgba(255,255,255,0.05);color:${extColor}">${ext}</span></td>
      <td>${sizeStr}</td>
      <td>${formatDate(f.uploadDate.split('T')[0])}</td>
      <td>${f.vencimiento ? formatDate(f.vencimiento) : '—'}</td>
      <td><span class="doc-status ${statusClass}">${statusText}</span></td>
      <td><div class="table-actions">
        <button onclick="deleteFileEntry('${f.id}','${key}')" title="Eliminar"><span class="material-icons-round">delete</span></button>
      </div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">
    <span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem">cloud_upload</span>
    No hay documentos cargados. Usa "Cargar Archivo" para agregar.
  </td></tr>`;
}

async function downloadFile(id) {
  const file = await dbDownloadFile(id);
  if (!file) return;
  if (file.url) {
    window.open(file.url, '_blank');
    return;
  }
  showToast('Error: El archivo no tiene enlace válido', 'error');
}

async function deleteFileEntry(id, key) {
  if (!confirm('¿Eliminar este archivo?')) return;
  await dbDeleteFile(id);
  showToast('Archivo eliminado');
  const files = await dbGetFiles(key);
  renderFileTable(key, files);
  renderDetailPage(key, DETAIL_PAGES[key]);
}

// ===== File Upload Modal =====
const fileModalOverlay = $('fileModalOverlay');
let pendingFiles = [];
let activeUploadTab = 'local';

const btnTabLocal = $('btnTabLocal');
const btnTabDrive = $('btnTabDrive');
const localUploadContainer = $('localUploadContainer');
const driveUploadContainer = $('driveUploadContainer');
const fileDriveUrl = $('fileDriveUrl');
const fileDriveName = $('fileDriveName');
const groupLocalDesc = $('groupLocalDesc');

function updateUploadButtonState() {
  if (activeUploadTab === 'local') {
    $('fileBtnUpload').disabled = pendingFiles.length === 0;
  } else {
    $('fileBtnUpload').disabled = fileDriveUrl.value.trim() === '' || fileDriveName.value.trim() === '';
  }
}

btnTabLocal.addEventListener('click', () => {
  activeUploadTab = 'local';
  btnTabLocal.classList.add('active');
  btnTabLocal.style.borderBottom = '2px solid var(--accent)';
  btnTabLocal.style.color = 'var(--text)';
  
  btnTabDrive.classList.remove('active');
  btnTabDrive.style.borderBottom = 'none';
  btnTabDrive.style.color = 'var(--text-muted)';
  
  localUploadContainer.style.display = 'block';
  driveUploadContainer.style.display = 'none';
  groupLocalDesc.style.display = 'block';
  updateUploadButtonState();
});

btnTabDrive.addEventListener('click', () => {
  activeUploadTab = 'drive';
  btnTabDrive.classList.add('active');
  btnTabDrive.style.borderBottom = '2px solid var(--accent)';
  btnTabDrive.style.color = 'var(--text)';
  
  btnTabLocal.classList.remove('active');
  btnTabLocal.style.borderBottom = 'none';
  btnTabLocal.style.color = 'var(--text-muted)';
  
  localUploadContainer.style.display = 'none';
  driveUploadContainer.style.display = 'block';
  groupLocalDesc.style.display = 'none';
  updateUploadButtonState();
});

fileDriveUrl.addEventListener('input', updateUploadButtonState);
fileDriveName.addEventListener('input', updateUploadButtonState);

$('btnUploadFile').addEventListener('click', () => {
  pendingFiles = [];
  $('fileInput').value = '';
  $('fileVencimiento').value = '';
  $('fileDescripcion').value = '';
  fileDriveUrl.value = '';
  fileDriveName.value = '';
  $('filePreviewList').innerHTML = '';
  btnTabLocal.click(); // Reset to local upload by default
  fileModalOverlay.classList.add('active');
});

$('fileModalClose').addEventListener('click', () => fileModalOverlay.classList.remove('active'));
$('fileBtnCancel').addEventListener('click', () => fileModalOverlay.classList.remove('active'));
fileModalOverlay.addEventListener('click', e => { if (e.target === fileModalOverlay) fileModalOverlay.classList.remove('active'); });

// Dropzone
const dropzone = $('fileDropzone');
dropzone.addEventListener('click', () => $('fileInput').click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
$('fileInput').addEventListener('change', e => handleFiles(e.target.files));

function handleFiles(fileList) {
  pendingFiles = [...pendingFiles, ...Array.from(fileList)];
  updateUploadButtonState();
  $('filePreviewList').innerHTML = pendingFiles.map((f, i) => {
    const size = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : (f.size / 1024).toFixed(0) + ' KB';
    const iconMap = { pdf:'picture_as_pdf', doc:'description', docx:'description', xls:'table_chart', xlsx:'table_chart', jpg:'image', jpeg:'image', png:'image', mp4:'videocam' };
    const ext = f.name.split('.').pop().toLowerCase();
    const icon = iconMap[ext] || 'insert_drive_file';
    return `<div class="file-preview-item">
      <span class="material-icons-round">${icon}</span>
      <span class="file-preview-name">${f.name}</span>
      <span class="file-preview-size">${size}</span>
      <button type="button" onclick="pendingFiles.splice(${i},1);handleFiles([])" class="btn-icon" style="width:28px;height:28px"><span class="material-icons-round" style="font-size:.9rem">close</span></button>
    </div>`;
  }).join('');
}

$('fileBtnUpload').addEventListener('click', async () => {
  if (!currentDetailKey) return;
  const venc = $('fileVencimiento').value || null;

  if (activeUploadTab === 'local') {
    if (pendingFiles.length === 0) return;
    const desc = $('fileDescripcion').value.trim();
    for (const file of pendingFiles) {
      await dbStoreFile(currentDetailKey, file.name, file, { vencimiento: venc, descripcion: desc || file.name });
    }
    showToast(`${pendingFiles.length} archivo(s) cargados`);
    addActivity(`Archivos cargados en <strong>${DETAIL_PAGES[currentDetailKey]?.title || currentDetailKey}</strong>`);
  } else {
    const urlStr = fileDriveUrl.value.trim();
    const docName = fileDriveName.value.trim();
    if (!urlStr || !docName) return;
    
    await dbStoreFile(currentDetailKey, docName, null, {
      vencimiento: venc,
      descripcion: docName,
      isLink: true,
      url: urlStr
    });
    showToast('Enlace de Google Drive vinculado');
    addActivity(`Enlace de Google Drive vinculado en <strong>${DETAIL_PAGES[currentDetailKey]?.title || currentDetailKey}</strong>`);
  }

  fileModalOverlay.classList.remove('active');
  pendingFiles = [];
  // FIX: Si es embarcación, usar renderEmbarcacion; si no, renderDetailPage
  if (typeof EMBARCACIONES_DATA !== 'undefined' && EMBARCACIONES_DATA[currentDetailKey]) {
    renderEmbarcacion(currentDetailKey);
  } else if (DETAIL_PAGES[currentDetailKey]) {
    renderDetailPage(currentDetailKey, DETAIL_PAGES[currentDetailKey]);
  }
});

// ===== Bulk Sync Documents from File Server =====
const btnSyncLocalFiles = $('btnSyncLocalFiles');
if (btnSyncLocalFiles) {
  btnSyncLocalFiles.addEventListener('click', async () => {
    const syncIcon = $('syncIcon');
    const syncText = $('syncText');
    
    if (btnSyncLocalFiles.disabled) return;
    
    // Set loading state
    btnSyncLocalFiles.disabled = true;
    btnSyncLocalFiles.style.opacity = '0.7';
    syncIcon.classList.add('spinning');
    syncText.textContent = 'Sincronizando...';
    showToast('Iniciando carga masiva desde servidor local...', 'success');
    
    try {
      const response = await fetch('/api/files');
      if (!response.ok) {
        throw new Error('Error al conectar con el servidor de archivos');
      }
      
      const files = await response.json();
      if (!files || files.length === 0) {
        showToast('No se encontraron archivos nuevos para sincronizar', 'error');
        return;
      }
      
      let newCount = 0;
      let existingCount = 0;
      
      const items = loadItems();
      
      for (const file of files) {
        // Check if item with this title already exists in category 'documento'
        const baseName = file.name.replace(/\.[^/.]+$/, ""); // Strip extension
        let existingItem = items.find(i => i.category === 'documento' && i.title.toLowerCase() === baseName.toLowerCase());
        
        let itemId;
        if (!existingItem) {
          // Create new general document item
          itemId = genId();
          let docType = 'otro';
          
          const lowerName = baseName.toLowerCase();
          if (lowerName.includes('matriz') || lowerName.includes('miper')) docType = 'matriz';
          else if (lowerName.includes('plan') || lowerName.includes('emergencia') || lowerName.includes('contingencia')) docType = 'plan_emergencia';
          else if (lowerName.includes('checklist') || lowerName.includes('inspeccion')) docType = 'checklist';
          else if (lowerName.includes('procedimiento') || lowerName.includes('pts')) docType = 'procedimiento';
          else if (lowerName.includes('acta')) docType = 'acta';
          else if (lowerName.includes('informe')) docType = 'informe';
          else if (lowerName.includes('odi') || lowerName.includes('irl')) docType = 'odi_irl';
          
          existingItem = {
            id: itemId,
            category: 'documento',
            title: baseName,
            description: 'Sincronizado masivamente desde carpeta de red Puerto Cisnes.',
            priority: 'alta',
            status: 'completada',
            dueDate: '2027-12-31', // Far future default
            assignee: 'Bastian',
            docType: docType,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          items.push(existingItem);
          newCount++;
        } else {
          itemId = existingItem.id;
          existingCount++;
        }
        
        // Convert base64 data back to Blob
        const byteCharacters = atob(file.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const fileBlob = new Blob([byteArray], { type: file.type || 'application/pdf' });
        
        // Save attachment file in IndexedDB under this item's ID as entityKey
        // Check if this file attachment is already in IndexedDB under this item
        const existingAttachments = await dbGetFiles(itemId);
        const hasAttachment = existingAttachments.some(att => att.fileName === file.name);
        
        if (!hasAttachment) {
          await dbStoreFile(itemId, file.name, fileBlob, {
            vencimiento: '2027-12-31',
            descripcion: baseName
          });
        }
      }
      
      // Save all updated/new document items to localStorage
      saveItems(items);
      
      // Refresh UI
      refreshAll();
      
      showToast(`¡Sincronización exitosa! ${newCount} nuevos, ${existingCount} actualizados`, 'success');
      addActivity(`Carga masiva: Sincronizados <strong>${files.length}</strong> documentos desde Google Drive`);
      
    } catch (err) {
      console.error(err);
      showToast('Error en la carga masiva: ' + err.message, 'error');
    } finally {
      // Restore button state
      btnSyncLocalFiles.disabled = false;
      btnSyncLocalFiles.style.opacity = '1';
      syncIcon.classList.remove('spinning');
      syncText.textContent = 'Carga Masiva (Google Drive)';
    }
  });
}

// ===== Init with Cloud Sync =====
async function syncFromCloud() {
  try {
    const pairs = [
      ['store/items', STORAGE_KEY],
      ['store/activity', ACTIVITY_KEY],
      ['store/dives', DIVE_KEY],
      ['store/checklists', CHECKLIST_KEY],
      ['store/notes', NOTES_KEY],
      ['store/files_meta', FILES_META_KEY],
      ['store/personal', PERSONAL_KEY],
      ['store/accidentes', 'prevrisk_accidentes'],
      ['store/extintores', 'prevrisk_extintores'],
      ['store/epp', 'prevrisk_epp'],
    ];
    let fetched = false;
    for (const [docPath, localKey] of pairs) {
      const doc = await firestore.doc(docPath).get();
      if (doc.exists && doc.data().data !== undefined) {
        const cloudData = doc.data().data;
        // No sobreescribir con arrays vacíos — protege la data local
        if (Array.isArray(cloudData) && cloudData.length === 0) continue;
        localStorage.setItem(localKey, JSON.stringify(cloudData));
        fetched = true;
      }
    }
    if (fetched) console.log('[Cloud] Datos sincronizados desde Firebase');
  } catch (e) {
    console.warn('[Cloud] No se pudo sincronizar, usando datos locales:', e.message);
  }
}

function setupRealtimeSync() {
  const mapping = [
    ['store/items', STORAGE_KEY],
    ['store/activity', ACTIVITY_KEY],
    ['store/dives', DIVE_KEY],
    ['store/checklists', CHECKLIST_KEY],
    ['store/notes', NOTES_KEY],
    ['store/files_meta', FILES_META_KEY],
    ['store/personal', PERSONAL_KEY],
  ];
  for (const [docPath, localKey] of mapping) {
    firestore.doc(docPath).onSnapshot(doc => {
      if (doc.exists && doc.data().data !== undefined) {
        const cloudData = JSON.stringify(doc.data().data);
        const localData = localStorage.getItem(localKey);
        if (cloudData !== localData) {
          localStorage.setItem(localKey, cloudData);
          console.log(`[Cloud] Actualizado desde la nube: ${docPath}`);
          refreshAll();
        }
      }
    }, err => console.warn('[Cloud] Listener error:', err));
  }
}

// ===== Daily Alerts =====
function checkDailyAlerts() {
  const todayDateStr = new Date().toISOString().split('T')[0];
  const lastAlert = localStorage.getItem('prevrisk_last_alert_date');
  
  // Only show once per day automatically
  if (lastAlert === todayDateStr) return;

  const alerts = [];
  const today = new Date();
  today.setHours(0,0,0,0);

  // Check Tasks (Items)
  const items = loadItems();
  items.forEach(item => {
    if (item.status !== 'completada' && item.dueDate) {
      const due = new Date(item.dueDate);
      due.setHours(0,0,0,0);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        alerts.push({ icon: 'error', color: 'var(--danger)', text: `Vencida hace ${Math.abs(diffDays)} días: <strong>${item.title}</strong>` });
      } else if (diffDays === 0) {
        alerts.push({ icon: 'warning', color: 'var(--warning)', text: `Vence HOY: <strong>${item.title}</strong>` });
      } else if (diffDays <= 3) {
        alerts.push({ icon: 'info', color: 'var(--info)', text: `Vence en ${diffDays} días: <strong>${item.title}</strong>` });
      }
    }
  });

  // Check Documents/Files
  const allFiles = loadFilesMeta();
  allFiles.forEach(file => {
    if (file.vencimiento) {
      const due = new Date(file.vencimiento);
      due.setHours(0,0,0,0);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      
      let areaTitle = DETAIL_PAGES[file.entityKey]?.title || 'Documento general';

      if (diffDays < 0) {
        alerts.push({ icon: 'description', color: 'var(--danger)', text: `Documento vencido (${areaTitle}): <strong>${file.fileName}</strong>` });
      } else if (diffDays <= 30) {
        alerts.push({ icon: 'description', color: 'var(--warning)', text: `Documento vence en ${diffDays} días (${areaTitle}): <strong>${file.fileName}</strong>` });
      }
    }
  });

  // Check Personal (Exámenes y Matrículas)
  const personalList = loadPersonal();
  personalList.forEach(p => {
    // Examen Médico
    if (p.vencExamen) {
      const due = new Date(p.vencExamen);
      due.setHours(0,0,0,0);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) alerts.push({ icon: 'medical_services', color: 'var(--danger)', text: `EXAMEN MÉDICO VENCIDO: <strong>${p.nombre}</strong>` });
      else if (diffDays <= 15) alerts.push({ icon: 'medical_services', color: 'var(--warning)', text: `Examen médico vence en ${diffDays} días: <strong>${p.nombre}</strong>` });
    }
    // Matrícula
    if (p.vencMatricula) {
      const due = new Date(p.vencMatricula);
      due.setHours(0,0,0,0);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) alerts.push({ icon: 'badge', color: 'var(--danger)', text: `MATRÍCULA VENCIDA: <strong>${p.nombre}</strong>` });
      else if (diffDays <= 30) alerts.push({ icon: 'badge', color: 'var(--warning)', text: `Matrícula vence en ${diffDays} días: <strong>${p.nombre}</strong>` });
    }
  });

  if (alerts.length > 0) {
    const container = $('alertsContainer');
    if (container) {
      container.innerHTML = alerts.map(a => `
        <div style="display:flex;align-items:center;gap:.8rem;background:var(--bg-primary);padding:.8rem;border-radius:var(--radius-sm);border-left:3px solid ${a.color};box-shadow:0 2px 5px rgba(0,0,0,.1)">
          <span class="material-icons-round" style="color:${a.color}">${a.icon}</span>
          <span style="font-size:.85rem;color:var(--text-primary)">${a.text}</span>
        </div>
      `).join('');
      
      $('alertsModalOverlay').classList.add('active');
    }
    
    // Request notification permission
    if (Notification.permission === 'granted') {
      new Notification('PrevRisk - Alertas del Día', {
        body: `Tienes ${alerts.length} alertas pendientes de revisar.`,
        icon: 'icon-192.png'
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification('PrevRisk - Notificaciones activadas', { body: 'Te avisaremos de vencimientos por aquí.' });
        }
      });
    }
  }

  // Mark as shown for today
  localStorage.setItem('prevrisk_last_alert_date', todayDateStr);
}

// Event listeners for alerts modal
if ($('alertsModalClose')) $('alertsModalClose').addEventListener('click', () => $('alertsModalOverlay').classList.remove('active'));
if ($('alertsBtnOk')) $('alertsBtnOk').addEventListener('click', () => $('alertsModalOverlay').classList.remove('active'));

// ===== MÓDULO DE PERSONAL =====
const personalGrid = $('personalGrid');
const personalModalOverlay = $('personalModalOverlay');
const personalForm = $('personalForm');
const btnNewPersonal = $('btnNewPersonal');

if (btnNewPersonal) btnNewPersonal.addEventListener('click', () => openPersonalModal());
if ($('personalModalClose')) $('personalModalClose').addEventListener('click', closePersonalModal);
if ($('personalBtnCancel')) $('personalBtnCancel').addEventListener('click', closePersonalModal);
if ($('personalBtnSave')) $('personalBtnSave').addEventListener('click', savePersonalForm);
if ($('personalBtnDelete')) $('personalBtnDelete').addEventListener('click', deletePersonalForm);

function closePersonalModal() {
  if (personalModalOverlay) personalModalOverlay.classList.remove('active');
}

function openPersonalModal(person = null) {
  if (!personalForm) return;
  personalForm.reset();
  $('personalId').value = '';
  $('personalBtnDelete').style.display = 'none';
  
  if (person) {
    $('personalModalTitle').textContent = 'Editar Trabajador';
    $('personalId').value = person.id;
    $('personalNombre').value = person.nombre || '';
    $('personalRut').value = person.rut || '';
    $('personalRol').value = person.rol || '';
    $('personalVencExamen').value = person.vencExamen || '';
    $('personalVencMatricula').value = person.vencMatricula || '';
    $('personalNotas').value = person.notas || '';
    $('personalBtnDelete').style.display = 'block';
  } else {
    $('personalModalTitle').textContent = 'Nuevo Trabajador';
  }
  personalModalOverlay.classList.add('active');
}

function savePersonalForm() {
  if (!personalForm.checkValidity()) {
    personalForm.reportValidity();
    return;
  }
  
  let list = loadPersonal();
  const id = $('personalId').value || 'pers_' + Date.now();
  
  const data = {
    id,
    nombre: $('personalNombre').value,
    rut: $('personalRut').value,
    rol: $('personalRol').value,
    vencExamen: $('personalVencExamen').value,
    vencMatricula: $('personalVencMatricula').value,
    notas: $('personalNotas').value,
    lastUpdated: new Date().toISOString()
  };
  
  const existingIndex = list.findIndex(p => p.id === id);
  if (existingIndex >= 0) {
    list[existingIndex] = data;
    addActivity(`Personal editado: <strong>${data.nombre}</strong>`);
  } else {
    list.push(data);
    addActivity(`Nuevo trabajador registrado: <strong>${data.nombre}</strong>`);
  }
  
  savePersonal(list);
  closePersonalModal();
  showToast('Ficha guardada');
  refreshAll();
}

function deletePersonalForm() {
  const id = $('personalId').value;
  if (!id) return;
  if (!confirm('¿Eliminar esta ficha de trabajador permanentemente?')) return;
  let list = loadPersonal();
  const p = list.find(x => x.id === id);
  list = list.filter(x => x.id !== id);
  savePersonal(list);
  if (p) addActivity(`Trabajador eliminado: <strong>${p.nombre}</strong>`);
  closePersonalModal();
  showToast('Ficha eliminada');
  refreshAll();
}

function refreshPersonal() {
  if (!personalGrid) return;
  const list = loadPersonal();
  
  let vencidosCount = 0;
  const todayStr = new Date().toISOString().split('T')[0];
  
  if (list.length === 0) {
    personalGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted)">No hay personal registrado aún.</div>`;
    if($('statTotalPersonal')) $('statTotalPersonal').textContent = '0';
    if($('statVencimientosPersonal')) $('statVencimientosPersonal').textContent = '0';
    return;
  }
  
  let html = '';
  list.forEach(p => {
    // Check expirations
    let examenStatus = '';
    if (p.vencExamen) {
      if (p.vencExamen < todayStr) { examenStatus = '<span style="color:var(--danger);font-size:.75rem;font-weight:bold"><span class="material-icons-round" style="font-size:.9rem;vertical-align:middle">error</span> Vencido</span>'; vencidosCount++; }
      else { examenStatus = `<span style="color:var(--success);font-size:.75rem">Vigente (${p.vencExamen})</span>`; }
    } else {
      examenStatus = '<span style="color:var(--text-muted);font-size:.75rem">Sin registrar</span>';
    }
    
    let matriculaStatus = '';
    if (p.vencMatricula) {
      if (p.vencMatricula < todayStr) { matriculaStatus = '<span style="color:var(--danger);font-size:.75rem;font-weight:bold"><span class="material-icons-round" style="font-size:.9rem;vertical-align:middle">error</span> Vencido</span>'; if(p.vencExamen >= todayStr || !p.vencExamen) vencidosCount++; }
      else { matriculaStatus = `<span style="color:var(--success);font-size:.75rem">Vigente (${p.vencMatricula})</span>`; }
    } else {
      if (p.rol.includes('Buzo') || p.rol.includes('Supervisor') || p.rol.includes('Contratista')) {
        matriculaStatus = '<span style="color:var(--text-muted);font-size:.75rem">Falta registrar</span>';
      } else {
        matriculaStatus = '<span style="color:var(--text-muted);font-size:.75rem">N/A</span>';
      }
    }

    const initials = p.nombre.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() || 'P';
    
    html += `
      <div class="panel" style="cursor:pointer;transition:transform 0.2s;box-shadow:var(--shadow);" onclick='openPersonalModalById("${p.id}")' onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
        <div class="panel-body">
          <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
            <div style="width:45px;height:45px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#00cec9);color:white;display:grid;place-items:center;font-weight:bold;font-size:1.1rem;flex-shrink:0">
              ${initials}
            </div>
            <div style="flex:1;overflow:hidden;">
              <h4 style="margin:0;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${p.nombre}">${p.nombre}</h4>
              <div style="font-size:.75rem;color:var(--text-secondary)">${p.rol}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.5rem;border-top:1px dashed var(--border);padding-top:.8rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:.8rem;color:var(--text-secondary)">Examen Médico:</span>
              ${examenStatus}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:.8rem;color:var(--text-secondary)">Matrícula:</span>
              ${matriculaStatus}
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  personalGrid.innerHTML = html;
  if($('statTotalPersonal')) $('statTotalPersonal').textContent = list.length;
  if($('statVencimientosPersonal')) $('statVencimientosPersonal').textContent = vencidosCount;
}

window.openPersonalModalById = function(id) {
  const list = loadPersonal();
  const p = list.find(x => x.id === id);
  if (p) openPersonalModal(p);
};


// ================================================================
// ===== DATOS REALES — EXÁMENES OCUPACIONALES =====
// ================================================================
const PERSONAL_REAL = [{"id": "real_001", "nombre": "Juan Guillermo Vargas Ojeda", "rut": "12.759.260-8", "rol": "Patron", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_002", "nombre": "Juan Manuel Hernandez Oyarzo", "rut": "11.911.503-5", "rol": "Tripulate", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_003", "nombre": "Jaime Alejandro Guerrero Hernandez", "rut": "19.253.970-6", "rol": "Motorista", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_004", "nombre": "Michel Antonio Ferreira Vega", "rut": "15.152.402-8", "rol": "Supervisor De Buceo", "embarcacion": "Alvarito", "vencExamen": "2026-07-29", "vencAltaMar": "2027-07-29", "vencMatricula": null, "notas": ""}, {"id": "real_005", "nombre": "Ariel Leandro Ferreira Vega", "rut": "18.500.999-8", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2026-10-20", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_006", "nombre": "Diego Antonio Zurita Martinez", "rut": "16.528.828-9", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2026-11-19", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_007", "nombre": "Guillermo Alfredo Gonzalez Adams", "rut": "11.541.523-9", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2026-11-17", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_008", "nombre": "Juan Hector Jaramillo Atero", "rut": "13.403.533-1", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2026-09-22", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_009", "nombre": "Luis Alejandro Hernandez Millacahuin", "rut": "15.493.472-3", "rol": "Cocinero", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_010", "nombre": "Juan Ariel Perez Oyarzo", "rut": "6.684.610-5", "rol": "Patron", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_011", "nombre": "Emanuel Ruben Opazo Carrasco", "rut": "7.111.846-0", "rol": "Motorista", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_012", "nombre": "Leonardo Favio Astete Gonzalez", "rut": "12.737.293-4", "rol": "Motorista", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_013", "nombre": "Hugo René Rivera Queipul", "rut": "10.564.089-7", "rol": "Tripulante", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_014", "nombre": "Cesar Esteban Jaramillo Atero", "rut": "17.465.958-3", "rol": "Supervisor De Buceo", "embarcacion": "Alvarito", "vencExamen": "2026-09-12", "vencAltaMar": "2028-09-12", "vencMatricula": null, "notas": ""}, {"id": "real_015", "nombre": "Damián Andrés Quintana Licancura", "rut": "15.188.321-4", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2026-09-10", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_016", "nombre": "José Ignacio Mariman Aburto", "rut": "18.844.418-0", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2027-01-27", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_017", "nombre": "Patricio Enrique Ferreira Fierro", "rut": "9.225.358-9", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2027-04-20", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_018", "nombre": "Patricio Orlando Ojeda Velasquez", "rut": "8.651.412-5", "rol": "Buzo", "embarcacion": "Alvarito", "vencExamen": "2027-01-26", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_019", "nombre": "Temisto Luis Vargas Carcamo", "rut": "8.982.332-3", "rol": "Cocinero", "embarcacion": "Alvarito", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_020", "nombre": "Enrique Patricio Barrientos Barrientos", "rut": "No encontrado", "rol": "Patron", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_021", "nombre": "Waldor Antonio Piutin Piutin", "rut": "14.089.498-2", "rol": "Motorista", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_022", "nombre": "José  Luis Ojeda Naudan", "rut": "16.158.882-2", "rol": "Tripulante", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_023", "nombre": "Jorge Daniel Mera Quintul", "rut": "12.755.374-2", "rol": "Supervisor De Buceo", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": "2027-03-17", "vencMatricula": null, "notas": ""}, {"id": "real_024", "nombre": "Alan Matias Rodriguez Santibañez", "rut": "21.230.564-2", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-07-30", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_025", "nombre": "Cesar Alejandro Oyarzun Elgueta", "rut": "15.281.460-7", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-11-19", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_026", "nombre": "Diego Adrian Llauca Loncon", "rut": "15.286.793-K", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2027-02-16", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_027", "nombre": "Edison Adan Raquil Villegas", "rut": "16.842.133-8", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-08-18", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_028", "nombre": "Javier Alejandro Romero Riquelme", "rut": "14.063.807-2", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-06-06", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_029", "nombre": "Juan Antonio Soto Ruiz", "rut": "11.927.742-6", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-06-24", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_030", "nombre": "Martin Javier Cadin Peña", "rut": "13.594.864-0", "rol": "Buzo", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_031", "nombre": "Samuel Alberto Cona Ortiz", "rut": "17.068.561-K", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-07-15", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_032", "nombre": "Jose Bernardo Paillan Ojeda", "rut": "11.310.814-2", "rol": "Operario", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_033", "nombre": "Juan Carlos Santibañez Painén", "rut": "13.393.470-7", "rol": "Operario", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_034", "nombre": "Víctor Enrique Alarcón Saldivia", "rut": "10.922.889-3", "rol": "Cocinero", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_035", "nombre": "José Lucio Guerrero Care", "rut": "12.307.862-4", "rol": "Patron", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_036", "nombre": "Pedro Jose Fernandez Olave", "rut": "10.790.279-1", "rol": "Motorista", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_037", "nombre": "Damian Ulises Ojeda Lemus", "rut": "17.639.816-7", "rol": "Tripulante", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_038", "nombre": "Marcos Alejandro Lavoz Velasquez", "rut": "15.758.278-K", "rol": "Supervisor De Buceo", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": "2026-12-16", "vencMatricula": null, "notas": ""}, {"id": "real_039", "nombre": "Alex Salomon Rivas Azocar", "rut": "16.928.479-2", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-10-27", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_040", "nombre": "Cesar Enrique Mansilla Castro", "rut": "10.045.295-2", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-10-06", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_041", "nombre": "Ernesto Rene Zuñiga Naiman", "rut": "20.085.902-2", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-12-11", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_042", "nombre": "German Daniel Cifuentes Gomez", "rut": "18.492.963-5", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2027-01-07", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_043", "nombre": "Héctor Marcelo Chiguay Canible", "rut": "11.719.191-5", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-10-14", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_044", "nombre": "Jonathan Javier Morales Sandoval", "rut": "17.011.921-5", "rol": "Buzo", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_045", "nombre": "Luis Richard Castro Mella", "rut": "10.935.630-1", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-11-05", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_046", "nombre": "Patricio Esteban Romero Espinoza", "rut": "12.321.485-4", "rol": "Buzo", "embarcacion": "María José", "vencExamen": "2026-10-08", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_047", "nombre": "Juan Carlos Díaz Guineo", "rut": "11.598.060-2", "rol": "Operario", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_048", "nombre": "Roger David Llauca Loncon", "rut": "13.849.823-9", "rol": "Operario", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_049", "nombre": "Carlos Omar Huenante Coby", "rut": "9.610.387-5", "rol": "Cocinero", "embarcacion": "María José", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_050", "nombre": "Bastian Nicolas Ancapan Vera", "rut": "20.624.300-7", "rol": "Prevencionista Administracion", "embarcacion": "Administración", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_051", "nombre": "Bianca Lia Rodriguez Rojas", "rut": "19.291.579-1", "rol": "Prevencionista Administracion", "embarcacion": "Administración", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_052", "nombre": "Camila Andrea Pereira Mayorga", "rut": "18.218.017-3", "rol": "Administracion", "embarcacion": "Administración", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_053", "nombre": "Daniela Fernanda Barrera Uribe", "rut": "17.595.118-0", "rol": "Administracion", "embarcacion": "Administración", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_054", "nombre": "Lorena Balbina Mansilla Mayorga", "rut": "17.911.956-0", "rol": "Administracion", "embarcacion": "Administración", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_055", "nombre": "Nicolas Segundo Cuevas  Muñoz", "rut": "17.588.549-8", "rol": "Administracion Puerto Natales", "embarcacion": "Administración", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_056", "nombre": "Jaime Alberto Guerrero Care", "rut": "11.716.271-0", "rol": "Supervisor De Varadero", "embarcacion": "Varadero", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_057", "nombre": "Esteban Marcial Cadagan Arratia", "rut": "19.022.212-8", "rol": "Varadero", "embarcacion": "Varadero", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_058", "nombre": "Hector Leonel Mansilla Mansilla", "rut": "9.915.351-2", "rol": "Nohcero", "embarcacion": "Varadero", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_059", "nombre": "Luis Alberto Haro Quincen", "rut": "17.056.587-8", "rol": "Soldador", "embarcacion": "Varadero", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_060", "nombre": "José Omar Ojeda Ojeda", "rut": "10.190.732-5", "rol": "Patron", "embarcacion": "Aukan", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_061", "nombre": "Víctor Fernando Enrique Sierpe Reyes", "rut": "18.449.096-K", "rol": "Patron", "embarcacion": "Aukan", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_062", "nombre": "Leandro Esteban Cifuentes Gomez", "rut": "21.249.541-7", "rol": "Buzo", "embarcacion": "Aukan", "vencExamen": "2025-06-03", "vencAltaMar": null, "vencMatricula": null, "notas": ""}, {"id": "real_063", "nombre": "Luis Benito Treimun Chacon", "rut": "9.362.901-9", "rol": "Cocinero", "embarcacion": "Aukan", "vencExamen": null, "vencAltaMar": null, "vencMatricula": null, "notas": ""}];

function seedPersonalReal() {
  const existing = loadPersonal();
  const merged = PERSONAL_REAL.map(real => {
    const prev = existing.find(e => e.rut === real.rut);
    return prev ? { ...real, notas: prev.notas || real.notas, driveUrl: prev.driveUrl||'', driveDesc: prev.driveDesc||'' } : real;
  });
  savePersonal(merged);
  console.log('[PrevRisk] Personal sincronizado: ' + merged.length + ' trabajadores');
}

// ===== Info Modal =====
function openInfoModal(title, html) {
  const overlay = document.getElementById('infoModalOverlay');
  const titleEl = document.getElementById('infoModalTitle');
  const body = document.getElementById('infoModalBody');
  if (!overlay || !titleEl || !body) return;
  titleEl.innerHTML = title;
  body.innerHTML = html;
  overlay.classList.add('active');
}
function closeInfoModal() {
  const overlay = document.getElementById('infoModalOverlay');
  if (overlay) overlay.classList.remove('active');
}
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('infoModalClose');
  const overlay  = document.getElementById('infoModalOverlay');
  if (closeBtn) closeBtn.addEventListener('click', closeInfoModal);
  if (overlay)  overlay.addEventListener('click', e => { if (e.target === overlay) closeInfoModal(); });
});

function showOverdueTasks() {
  const today = new Date().toISOString().split('T')[0];
  const all = loadItems();
  const overdue = all.filter(i => i.status !== 'completada' && i.dueDate && i.dueDate < today);
  if (overdue.length === 0) { showToast('No hay tareas vencidas', 'success'); return; }

  const catIcon  = { tarea:'task_alt', documento:'description', capacitacion:'school', inspeccion:'fact_check' };
  const catLabel = { tarea:'Tarea', documento:'Documento', capacitacion:'Capacitación', inspeccion:'Inspección' };

  const rows = overdue.map(i => {
    const dias = Math.ceil((new Date(today) - new Date(i.dueDate)) / 86400000);
    return `
      <div class="upcoming-item" style="cursor:pointer" onclick="closeInfoModal();openModal(loadItems().find(x=>x.id==='${i.id}'))">
        <span class="material-icons-round upcoming-icon" style="color:var(--danger);width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:rgba(244,63,94,.12);flex-shrink:0">${catIcon[i.category] || 'task_alt'}</span>
        <div class="upcoming-info" style="flex:1">
          <div class="upcoming-title">${i.title}</div>
          <div class="upcoming-date">${catLabel[i.category] || i.category} · Venció hace ${dias} día${dias !== 1 ? 's' : ''} (${formatDate(i.dueDate)})</div>
        </div>
        <span class="status-badge ${i.status === 'en_progreso' ? 'status-en_progreso' : 'status-pendiente'}">${i.status === 'en_progreso' ? 'En progreso' : 'Pendiente'}</span>
      </div>`;
  }).join('');

  openInfoModal(
    `<span class="material-icons-round" style="color:var(--danger);vertical-align:middle;margin-right:.4rem">warning</span>Tareas Vencidas (${overdue.length})`,
    `<div style="display:flex;flex-direction:column;gap:.5rem">${rows}</div>`
  );
}
window.showOverdueTasks = showOverdueTasks;

function showPersonalVencimientos() {
  const today = new Date().toISOString().split('T')[0];
  const soon  = new Date(today); soon.setDate(soon.getDate() + 60);
  const soonStr = soon.toISOString().split('T')[0];

  const personal = loadPersonal();
  const afectados = personal.filter(p => {
    const v = p.vencExamen || p.vencMatricula;
    return v && v <= soonStr;
  });

  if (afectados.length === 0) { showToast('No hay documentos vencidos ni por vencer', 'success'); return; }

  const rows = afectados.map(p => {
    const problemas = [];
    [['Examen Médico', p.vencExamen], ['Matrícula / Alta Mar', p.vencMatricula]].forEach(([label, venc]) => {
      if (!venc) return;
      if (venc < today) {
        problemas.push(`<div style="display:flex;align-items:center;gap:.4rem;padding:.22rem .55rem;border-radius:6px;background:rgba(244,63,94,.1);font-size:.78rem;font-weight:600;color:var(--danger)"><span class="material-icons-round" style="font-size:.9rem">error</span>${label}: Vencido el ${formatDate(venc)}</div>`);
      } else if (venc <= soonStr) {
        const diff = Math.ceil((new Date(venc) - new Date(today)) / 86400000);
        problemas.push(`<div style="display:flex;align-items:center;gap:.4rem;padding:.22rem .55rem;border-radius:6px;background:rgba(245,158,11,.1);font-size:.78rem;font-weight:600;color:var(--warning)"><span class="material-icons-round" style="font-size:.9rem">schedule</span>${label}: Vence en ${diff} día${diff !== 1 ? 's' : ''} (${formatDate(venc)})</div>`);
      }
    });
    const initials = p.nombre.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem;display:flex;flex-direction:column;gap:.45rem">
        <div style="display:flex;align-items:center;gap:.65rem">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#7c5bf5);display:grid;place-items:center;color:#fff;font-weight:800;font-size:.72rem;flex-shrink:0">${initials}</div>
          <div>
            <div style="font-weight:700;font-size:.85rem">${p.nombre}</div>
            <div style="font-size:.72rem;color:var(--text-muted)">${p.rol || ''}</div>
          </div>
        </div>
        ${problemas.join('')}
      </div>`;
  }).join('');

  openInfoModal(
    `<span class="material-icons-round" style="color:var(--warning);vertical-align:middle;margin-right:.4rem">warning_amber</span>Documentos por Vencer / Vencidos (${afectados.length})`,
    `<div style="display:flex;flex-direction:column;gap:.6rem">${rows}</div>`
  );
}
window.showPersonalVencimientos = showPersonalVencimientos;

async function init(){
  initTheme();
  const hideLoader=()=>{const ls=document.getElementById('loadingScreen');if(ls){ls.style.opacity='0';setTimeout(()=>{ls.style.display='none';},500);}};
  const lt=setTimeout(hideLoader,5000);
  const sess=sessionStorage.getItem('prevrisk_session');
  if(!sess){const ov=document.getElementById('loginOverlay');if(ov){ov.style.display='grid';ov.classList.add('active');}const main=document.getElementById('mainContent');const sb=document.getElementById('sidebar');if(main)main.style.filter='blur(6px) brightness(.35)';if(sb)sb.style.filter='blur(6px) brightness(.35)';}
  else{const ov=document.getElementById('loginOverlay');if(ov){ov.classList.remove('active');ov.style.display='none';}}
  // Limpieza única de datos demo pre-seeded (ejecuta solo una vez)
  if (!localStorage.getItem('prevrisk_demo_cleared_v1')) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem('prevrisk_demo_cleared_v1', '1');
  }
  try{await openDB();await Promise.race([syncFromCloud(),new Promise(r=>setTimeout(r,3000))]);seedDiveDemoData();seedPersonalReal();refreshAll();setupRealtimeSync();setTimeout(checkDailyAlerts,1200);clearTimeout(lt);hideLoader();if(typeof initNotificationBell==='function')initNotificationBell();console.log('[PrevRisk V2] OK');}
  catch(err){console.warn('[PrevRisk]',err);if(!localStorage.getItem('prevrisk_demo_cleared_v1')){localStorage.removeItem(STORAGE_KEY);localStorage.setItem('prevrisk_demo_cleared_v1','1');}seedDiveDemoData();seedPersonalReal();refreshAll();clearTimeout(lt);hideLoader();if(typeof initNotificationBell==='function')initNotificationBell();}
}
init();

// ================================================================
// ===== MÓDULO LOGIN / AUTENTICACIÓN =====
// ================================================================
const USERS = [
  { user: 'bastian', pass: 'prevrisk2026', nombre: 'Bastian', rol: 'Prev. de Riesgos' },
  { user: 'admin',   pass: 'admin2026',   nombre: 'Admin',   rol: 'Administrador' }
];
const SESSION_KEY = 'prevrisk_session';

function checkSession() {
  const s = sessionStorage.getItem(SESSION_KEY);
  if (s) {
    try {
      const u = JSON.parse(s);
      hideLogin(u);
      return true;
    } catch(e) {}
  }
  showLogin();
  return false;
}

function showLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.style.display = 'grid';
    overlay.classList.add('active');
  }
  // Bloquear main
  const main = document.getElementById('mainContent');
  const sidebar = document.getElementById('sidebar');
  if (main) main.style.filter = 'blur(6px) brightness(.4)';
  if (sidebar) sidebar.style.filter = 'blur(6px) brightness(.4)';
}

function hideLogin(user){const ov=document.getElementById('loginOverlay');if(ov){ov.classList.remove('active');ov.style.display='none';}const main=document.getElementById('mainContent');const sb=document.getElementById('sidebar');if(main)main.style.filter='';if(sb)sb.style.filter='';const uN=document.querySelector('.user-name'),uR=document.querySelector('.user-role'),uA=document.querySelector('.user-avatar');if(user){if(uN)uN.textContent=user.nombre;if(uR)uR.textContent=user.rol;if(uA)uA.textContent=user.nombre.slice(0,2).toUpperCase();}setTimeout(()=>{if(typeof renderNotifList==='function')renderNotifList();},1500);}

function doLogin(){const u=(document.getElementById('loginUser')?.value||'').trim().toLowerCase();const p=(document.getElementById('loginPass')?.value||'').trim();const errEl=document.getElementById('loginError');const errTxt=document.getElementById('loginErrorText');if(errEl)errEl.style.display='none';if(!u||!p){if(errEl)errEl.style.display='flex';if(errTxt)errTxt.textContent='Ingresa usuario y contraseña.';return;}const found=USERS.find(x=>x.user===u&&x.pass===p);if(found){sessionStorage.setItem(SESSION_KEY,JSON.stringify(found));hideLogin(found);showToast('Bienvenido, '+found.nombre+' 👋');addActivity('Sesión iniciada: <strong>'+found.nombre+'</strong>');}else{if(errEl)errEl.style.display='flex';if(errTxt)errTxt.textContent='Usuario o contraseña incorrectos.';const pe=document.getElementById('loginPass');if(pe){pe.value='';pe.focus();}}}

// Eventos login
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  if (typeof _initExtraModules === 'function') _initExtraModules();

  const btnLogin = document.getElementById('btnLogin');
  const loginPass = document.getElementById('loginPass');
  const loginUser = document.getElementById('loginUser');
  const btnTogglePass = document.getElementById('btnTogglePass');

  if (btnLogin) btnLogin.addEventListener('click', doLogin);
  if (loginPass) loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (loginUser) loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPass').focus(); });
  if (btnTogglePass) {
    btnTogglePass.addEventListener('click', () => {
      const inp = document.getElementById('loginPass');
      const icon = btnTogglePass.querySelector('.material-icons-round');
      if (inp.type === 'password') { inp.type = 'text'; icon.textContent = 'visibility_off'; }
      else { inp.type = 'password'; icon.textContent = 'visibility'; }
    });
  }

  // Botón logout en sidebar footer
  const footer = document.querySelector('.sidebar-footer');
  if (footer && !document.getElementById('btnLogout')) {
    const btn = document.createElement('button');
    btn.id = 'btnLogout';
    btn.title = 'Cerrar sesión';
    btn.style.cssText = 'margin-top:.5rem;width:100%;display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;border-radius:8px;color:var(--danger);font-size:.78rem;font-weight:600;background:none;border:none;cursor:pointer;transition:.2s;';
    btn.innerHTML = '<span class="material-icons-round" style="font-size:1.1rem">logout</span> Cerrar sesión';
    btn.addEventListener('mouseover', () => btn.style.background = 'rgba(240,91,122,.1)');
    btn.addEventListener('mouseout',  () => btn.style.background = 'none');
    btn.addEventListener('click', () => {
      if (confirm('¿Cerrar sesión?')) {
        sessionStorage.removeItem(SESSION_KEY);
        showLogin();
      }
    });
    footer.appendChild(btn);
  }

  // ===== Patch refreshAll con KPIs + Gantt + nuevos módulos =====
  const origRA = window.refreshAll;
  if (origRA) {
    window.refreshAll = function() {
      origRA();
      if (typeof renderKPIRow === 'function') renderKPIRow();
      if (typeof renderTrendChart === 'function') renderTrendChart();
      if (typeof renderIndicesAccidentabilidad === 'function') renderIndicesAccidentabilidad();
      if (document.getElementById('view-sst-carta-gantt')?.classList.contains('active')) {
        if (typeof renderGantt === 'function') renderGantt();
      }
    };
  }

  // ===== Render Gantt al navegar =====
  document.querySelectorAll('[data-view="sst-carta-gantt"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(() => { if(typeof renderGantt==='function') renderGantt(); }, 60));
  });

  // ===== Botón cargar archivo en Flota =====
  const btnUploadFileEmb = document.getElementById('btnUploadFileEmb');
  if (btnUploadFileEmb) {
    btnUploadFileEmb.addEventListener('click', () => {
      if (typeof pendingFiles !== 'undefined') pendingFiles = [];
      ['fileInput','fileVencimiento','fileDescripcion','fileDriveUrl','fileDriveName'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const prev = document.getElementById('filePreviewList');
      if (prev) prev.innerHTML = '';
      document.getElementById('btnTabLocal')?.click();
      document.getElementById('fileModalOverlay')?.classList.add('active');
    });
  }

  // ===== Notificaciones, PDF, Móvil =====
  if (typeof initNotificaciones === 'function') initNotificaciones();
  if (typeof addPDFButtons === 'function') addPDFButtons();
  if (typeof mejorarMovil === 'function') mejorarMovil();
  if (typeof checkNotificacionesDiarias === 'function') checkNotificacionesDiarias();
  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(el => {
    el.addEventListener('click', () => setTimeout(() => { if(typeof addPDFButtons==='function') addPDFButtons(); }, 100));
  });

  // ===== KPIs iniciales =====
  setTimeout(() => {
    if (typeof renderKPIRow === 'function') renderKPIRow();
    if (typeof renderTrendChart === 'function') renderTrendChart();
    if (typeof renderIndicesAccidentabilidad === 'function') renderIndicesAccidentabilidad();
  }, 800);
});

// ================================================================
// ===== MÓDULO ACCIDENTES =====
// ================================================================
const ACC_KEY = 'prevrisk_accidentes';

function loadAccidentes() { try { return JSON.parse(localStorage.getItem(ACC_KEY)) || []; } catch { return []; } }
function saveAccidentes(data) {
  localStorage.setItem(ACC_KEY, JSON.stringify(data));
  cloudSave('store/accidentes', data);
}

function refreshAccidentes() {
  const list = loadAccidentes();
  const today = new Date().toISOString().split('T')[0];

  // Stats
  const total = list.length;
  const abiertos = list.filter(a => a.estado === 'abierto').length;
  const invest = list.filter(a => a.estado === 'en_investigacion').length;
  const cerrados = list.filter(a => a.estado === 'cerrado').length;

  const s = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  s('statAccTotal', total); s('statAccAbiertos', abiertos);
  s('statAccInvestigacion', invest); s('statAccCerrados', cerrados);

  const tbody = document.getElementById('accidentesBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted)"><span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem">local_hospital</span>Sin accidentes registrados</td></tr>`;
    return;
  }

  const gravColors = { leve:'var(--success)', moderado:'var(--warning)', grave:'var(--danger)', fatal:'#ff0000' };
  const estadoBadge = { abierto:'status-pendiente', en_investigacion:'status-en_progreso', cerrado:'status-completada' };
  const estadoLabel = { abierto:'Abierto', en_investigacion:'En Investigación', cerrado:'Cerrado' };

  tbody.innerHTML = list.sort((a,b) => b.fecha.localeCompare(a.fecha)).map(a => `
    <tr>
      <td><strong>${a.nombre}</strong><br><span style="font-size:.72rem;color:var(--text-muted)">${a.cargo || ''}</span></td>
      <td>${formatDate(a.fecha)}</td>
      <td style="font-size:.78rem">${a.tipo?.replace(/_/g,' ') || ''}</td>
      <td><span style="color:${gravColors[a.gravedad] || 'var(--text-primary)'}; font-weight:700; font-size:.78rem; text-transform:capitalize">${a.gravedad || ''}</span></td>
      <td style="font-size:.82rem">${a.area || '—'}</td>
      <td style="text-align:center;font-weight:700">${a.reposo || 0}</td>
      <td><span class="status-badge ${estadoBadge[a.estado] || ''}">${estadoLabel[a.estado] || a.estado}</span></td>
      <td><div class="table-actions">
        <button onclick="openAccidenteModal('${a.id}')" title="Editar"><span class="material-icons-round" style="font-size:1rem">edit</span></button>
      </div></td>
    </tr>`).join('');
}

function openAccidenteModal(id) {
  const form = document.getElementById('accidenteForm');
  if (!form) return;
  form.reset();
  document.getElementById('accidenteId').value = '';
  document.getElementById('accidenteBtnDelete').style.display = 'none';
  document.getElementById('accidenteModalTitle').innerHTML = '<span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;color:var(--danger)">local_hospital</span>Nuevo Registro';

  if (id) {
    const acc = loadAccidentes().find(a => a.id === id);
    if (acc) {
      document.getElementById('accidenteModalTitle').innerHTML = '<span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;color:var(--danger)">local_hospital</span>Editar Accidente';
      document.getElementById('accidenteId').value = acc.id;
      ['Nombre','Rut','Cargo','Area','Fecha','Hora','Descripcion','Lesion','Mutual','Denuncia','CausaInmediata','CausaBasica','Correctivas','Investigador'].forEach(f => {
        const el = document.getElementById('acc'+f);
        if (el) el.value = acc[f.toLowerCase()] || '';
      });
      const selFields = ['Tipo','Gravedad','Estado'];
      selFields.forEach(f => { const el = document.getElementById('acc'+f); if(el) el.value = acc[f.toLowerCase()] || ''; });
      const rep = document.getElementById('accReposo');
      if (rep) rep.value = acc.reposo || 0;
      document.getElementById('accidenteBtnDelete').style.display = 'block';
    }
  }
  document.getElementById('accidenteModalOverlay').classList.add('active');
}

function saveAccidenteForm() {
  const id = document.getElementById('accidenteId').value || 'acc_' + Date.now();
  const get = (elId) => { const el = document.getElementById(elId); return el ? el.value : ''; };

  if (!get('accNombre') || !get('accFecha')) { showToast('Nombre y fecha son obligatorios', 'error'); return; }

  const data = {
    id, nombre: get('accNombre'), rut: get('accRut'), cargo: get('accCargo'),
    area: get('accArea'), fecha: get('accFecha'), hora: get('accHora'),
    tipo: get('accTipo'), gravedad: get('accGravedad'), descripcion: get('accDescripcion'),
    lesion: get('accLesion'), reposo: parseInt(get('accReposo')) || 0,
    mutual: get('accMutual'), denuncia: get('accDenuncia'),
    causainmediata: get('accCausaInmediata'), causabasica: get('accCausaBasica'),
    correctivas: get('accCorrectivas'), investigador: get('accInvestigador'),
    estado: get('accEstado'), createdAt: new Date().toISOString()
  };

  let list = loadAccidentes();
  const idx = list.findIndex(a => a.id === id);
  if (idx >= 0) { list[idx] = data; addActivity(`Accidente actualizado: <strong>${data.nombre}</strong>`); }
  else { list.push(data); addActivity(`Nuevo accidente registrado: <strong>${data.nombre}</strong>`); }

  saveAccidentes(list);
  document.getElementById('accidenteModalOverlay').classList.remove('active');
  showToast('Registro guardado');
  refreshAccidentes();
}

function deleteAccidenteForm() {
  const id = document.getElementById('accidenteId').value;
  if (!id || !confirm('¿Eliminar este registro permanentemente?')) return;
  let list = loadAccidentes().filter(a => a.id !== id);
  saveAccidentes(list);
  document.getElementById('accidenteModalOverlay').classList.remove('active');
  showToast('Registro eliminado');
  refreshAccidentes();
}

// Eventos Accidentes
(function() {
  const ov = document.getElementById('accidenteModalOverlay');
  if (!ov) return;
  document.getElementById('accidenteModalClose')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('accidenteBtnCancel')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('accidenteBtnSave')?.addEventListener('click', saveAccidenteForm);
  document.getElementById('accidenteBtnDelete')?.addEventListener('click', deleteAccidenteForm);
  document.getElementById('btnNewAccidente')?.addEventListener('click', () => openAccidenteModal(null));
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); });
})();

window.openAccidenteModal = openAccidenteModal;

// ================================================================
// ===== MÓDULO EXTINTORES =====
// ================================================================
const EXT_KEY = 'prevrisk_extintores';

function loadExtintores() { try { return JSON.parse(localStorage.getItem(EXT_KEY)) || []; } catch { return []; } }
function saveExtintores(data) { localStorage.setItem(EXT_KEY, JSON.stringify(data)); cloudSave('store/extintores', data); }

function refreshExtintores() {
  const list = loadExtintores();
  const today = new Date().toISOString().split('T')[0];

  const total = list.length;
  const operativos = list.filter(e => e.estado === 'operativo').length;
  const porRecargar = list.filter(e => e.estado === 'por_recargar' || (e.proximarecarga && e.proximarecarga <= today && e.estado !== 'dado_baja')).length;
  const baja = list.filter(e => e.estado === 'dado_baja').length;

  const s = (id,v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  s('statExtTotal',total); s('statExtOperativos',operativos); s('statExtPorRecargar',porRecargar); s('statExtBaja',baja);

  const tbody = document.getElementById('extinctoresBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted)"><span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem">fire_extinguisher</span>Sin extintores registrados. Agrega el primero.</td></tr>`;
    return;
  }

  const estadoColor = { operativo:'doc-vigente', por_recargar:'doc-por-vencer', en_recarga:'status-en_progreso', dado_baja:'doc-vencido' };
  const estadoLabel = { operativo:'Operativo', por_recargar:'Por Recargar', en_recarga:'En Recarga', dado_baja:'Dado de Baja' };

  tbody.innerHTML = list.map(e => {
    const venceProx = e.proximarecarga && e.proximarecarga <= today;
    const fechaColor = venceProx ? 'color:var(--danger);font-weight:700' : '';
    return `<tr>
      <td><strong>${e.codigo}</strong></td>
      <td><span class="priority-badge priority-alta" style="font-size:.72rem">${e.tipo}</span></td>
      <td>${e.capacidad || '—'}</td>
      <td>${e.ubicacion}</td>
      <td style="font-size:.82rem">${e.embarcacion || '—'}</td>
      <td style="${fechaColor}">${e.proximarecarga ? formatDate(e.proximarecarga) : '—'}</td>
      <td><span class="doc-status ${estadoColor[e.estado] || ''}">${estadoLabel[e.estado] || e.estado}</span></td>
      <td><div class="table-actions">
        <button onclick="openExtinctorModal('${e.id}')" title="Editar"><span class="material-icons-round" style="font-size:1rem">edit</span></button>
      </div></td>
    </tr>`;
  }).join('');
}

function openExtinctorModal(id) {
  const form = document.getElementById('extinctorForm');
  if (!form) return;
  form.reset();
  document.getElementById('extinctorId').value = '';
  document.getElementById('extinctorBtnDelete').style.display = 'none';
  document.getElementById('extinctorModalTitle').innerHTML = '<span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;color:var(--danger)">fire_extinguisher</span>Nuevo Extintor';

  if (id) {
    const ext = loadExtintores().find(e => e.id === id);
    if (ext) {
      document.getElementById('extinctorModalTitle').innerHTML = '<span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;color:var(--danger)">fire_extinguisher</span>Editar Extintor';
      document.getElementById('extinctorId').value = ext.id;
      const fields = { extCodigo:'codigo', extCapacidad:'capacidad', extUbicacion:'ubicacion', extEmbarcacion:'embarcacion', extUltimaRecarga:'ultrimarecarga', extProximaRecarga:'proximarecarga', extEmpresa:'empresa', extObservaciones:'observaciones' };
      Object.entries(fields).forEach(([elId, key]) => { const el = document.getElementById(elId); if(el) el.value = ext[key] || ''; });
      ['extTipo','extEstado'].forEach(selId => { const el = document.getElementById(selId); if(el) el.value = ext[selId.replace('ext','').toLowerCase()] || ''; });
      document.getElementById('extinctorBtnDelete').style.display = 'block';
    }
  }
  document.getElementById('extinctorModalOverlay').classList.add('active');
}

function saveExtintorForm() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (!get('extCodigo') || !get('extUbicacion')) { showToast('Código y ubicación son obligatorios', 'error'); return; }

  const id = get('extinctorId') || 'ext_' + Date.now();
  const data = {
    id, codigo: get('extCodigo'), tipo: get('extTipo'), capacidad: get('extCapacidad'),
    ubicacion: get('extUbicacion'), embarcacion: get('extEmbarcacion'),
    ultrimarecarga: get('extUltimaRecarga'), proximarecarga: get('extProximaRecarga'),
    estado: get('extEstado'), empresa: get('extEmpresa'), observaciones: get('extObservaciones'),
    updatedAt: new Date().toISOString()
  };

  let list = loadExtintores();
  const idx = list.findIndex(e => e.id === id);
  if (idx >= 0) { list[idx] = data; } else { list.push(data); }
  saveExtintores(list);
  document.getElementById('extinctorModalOverlay').classList.remove('active');
  showToast('Extintor guardado');
  addActivity(`Extintor ${data.codigo} actualizado`);
  refreshExtintores();
}

function deleteExtintorForm() {
  const id = document.getElementById('extinctorId').value;
  if (!id || !confirm('¿Eliminar este extintor?')) return;
  saveExtintores(loadExtintores().filter(e => e.id !== id));
  document.getElementById('extinctorModalOverlay').classList.remove('active');
  showToast('Extintor eliminado');
  refreshExtintores();
}

(function() {
  const ov = document.getElementById('extinctorModalOverlay');
  if (!ov) return;
  document.getElementById('extinctorModalClose')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('extinctorBtnCancel')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('extinctorBtnSave')?.addEventListener('click', saveExtintorForm);
  document.getElementById('extinctorBtnDelete')?.addEventListener('click', deleteExtintorForm);
  document.getElementById('btnNewExtintor')?.addEventListener('click', () => openExtinctorModal(null));
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); });
})();

window.openExtinctorModal = openExtinctorModal;

// ================================================================
// ===== MÓDULO EPP =====
// ================================================================
const EPP_KEY = 'prevrisk_epp';

function loadEPP() { try { return JSON.parse(localStorage.getItem(EPP_KEY)) || []; } catch { return []; } }
function saveEPP(data) { localStorage.setItem(EPP_KEY, JSON.stringify(data)); cloudSave('store/epp', data); }

function refreshEPP() {
  const list = loadEPP();
  const today = new Date().toISOString().split('T')[0];
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const in30str = in30.toISOString().split('T')[0];

  const total = list.length;
  const vigentes = list.filter(e => e.estado === 'vigente' || (!e.vencimiento || e.vencimiento > in30str)).length;
  const porVencer = list.filter(e => e.vencimiento && e.vencimiento > today && e.vencimiento <= in30str).length;
  const vencidos = list.filter(e => e.vencimiento && e.vencimiento <= today).length;

  const s = (id,v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  s('statEppTotal',total); s('statEppVigentes',vigentes); s('statEppPorVencer',porVencer); s('statEppVencidos',vencidos);

  const tbody = document.getElementById('eppBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted)"><span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem">security</span>Sin EPP registrados. Agrega el primero.</td></tr>`;
    return;
  }

  const tipoLabel = { casco:'Casco', arnes:'Arnés', guantes:'Guantes', zapatos:'Zapatos', lentes:'Lentes', respirador:'Respirador', traje_buceo:'Traje Buceo', chaleco:'Chaleco SV', protector_auditivo:'Prot. Auditivo', otro:'Otro' };
  const estadoColor = { vigente:'doc-vigente', por_vencer:'doc-por-vencer', vencido:'doc-vencido', danado:'status-pendiente' };
  const estadoLabel = { vigente:'Vigente', por_vencer:'Por Vencer', vencido:'Vencido', danado:'Dañado' };

  tbody.innerHTML = list.map(e => {
    const venc = e.vencimiento;
    let estadoBadge = e.estado;
    if (venc) {
      if (venc <= today) estadoBadge = 'vencido';
      else if (venc <= in30str) estadoBadge = 'por_vencer';
    }
    return `<tr>
      <td><strong>${e.trabajador}</strong><br><span style="font-size:.72rem;color:var(--text-muted)">${e.rut || ''}</span></td>
      <td>${tipoLabel[e.tipo] || e.tipo}</td>
      <td style="font-size:.82rem">${e.marca || '—'}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${e.certificacion || '—'}</td>
      <td style="font-size:.82rem">${e.area || '—'}</td>
      <td style="${estadoBadge === 'vencido' ? 'color:var(--danger);font-weight:700' : estadoBadge === 'por_vencer' ? 'color:var(--warning);font-weight:700' : ''}">${venc ? formatDate(venc) : '—'}</td>
      <td><span class="doc-status ${estadoColor[estadoBadge] || ''}">${estadoLabel[estadoBadge] || estadoBadge}</span></td>
      <td><div class="table-actions">
        <button onclick="openEPPModal('${e.id}')" title="Editar"><span class="material-icons-round" style="font-size:1rem">edit</span></button>
      </div></td>
    </tr>`;
  }).join('');
}

function openEPPModal(id) {
  const form = document.getElementById('eppForm');
  if (!form) return;
  form.reset();
  document.getElementById('eppId').value = '';
  document.getElementById('eppBtnDelete').style.display = 'none';

  if (id) {
    const epp = loadEPP().find(e => e.id === id);
    if (epp) {
      document.getElementById('eppId').value = epp.id;
      const fields = { eppTrabajador:'trabajador', eppRut:'rut', eppMarca:'marca', eppCertificacion:'certificacion', eppTalla:'talla', eppFechaEntrega:'fechaentrega', eppVencimiento:'vencimiento', eppArea:'area', eppObservaciones:'observaciones' };
      Object.entries(fields).forEach(([elId, key]) => { const el = document.getElementById(elId); if(el) el.value = epp[key] || ''; });
      ['eppTipo','eppEstado'].forEach(selId => { const el = document.getElementById(selId); const key = selId.replace('epp','').toLowerCase(); if(el) el.value = epp[key] || ''; });
      document.getElementById('eppBtnDelete').style.display = 'block';
    }
  }
  document.getElementById('eppModalOverlay').classList.add('active');
}

function saveEPPForm() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (!get('eppTrabajador')) { showToast('El nombre del trabajador es obligatorio', 'error'); return; }

  const id = get('eppId') || 'epp_' + Date.now();
  const data = {
    id, trabajador: get('eppTrabajador'), rut: get('eppRut'), tipo: get('eppTipo'),
    marca: get('eppMarca'), certificacion: get('eppCertificacion'), talla: get('eppTalla'),
    fechaentrega: get('eppFechaEntrega'), vencimiento: get('eppVencimiento'),
    estado: get('eppEstado'), area: get('eppArea'), observaciones: get('eppObservaciones'),
    updatedAt: new Date().toISOString()
  };

  let list = loadEPP();
  const idx = list.findIndex(e => e.id === id);
  if (idx >= 0) { list[idx] = data; } else { list.push(data); }
  saveEPP(list);
  document.getElementById('eppModalOverlay').classList.remove('active');
  showToast('EPP guardado');
  addActivity(`EPP registrado: <strong>${data.trabajador}</strong> — ${data.tipo}`);
  refreshEPP();
}

function deleteEPPForm() {
  const id = document.getElementById('eppId').value;
  if (!id || !confirm('¿Eliminar este EPP?')) return;
  saveEPP(loadEPP().filter(e => e.id !== id));
  document.getElementById('eppModalOverlay').classList.remove('active');
  showToast('EPP eliminado');
  refreshEPP();
}

(function() {
  const ov = document.getElementById('eppModalOverlay');
  if (!ov) return;
  document.getElementById('eppModalClose')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('eppBtnCancel')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('eppBtnSave')?.addEventListener('click', saveEPPForm);
  document.getElementById('eppBtnDelete')?.addEventListener('click', deleteEPPForm);
  document.getElementById('btnNewEPP')?.addEventListener('click', () => openEPPModal(null));
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); });
})();

window.openEPPModal = openEPPModal;

// ================================================================
// ===== DRAG & DROP KANBAN =====
// ================================================================
function initKanbanDragDrop() {
  let draggedId = null;

  document.addEventListener('dragstart', e => {
    const card = e.target.closest('.kanban-card[draggable]');
    if (card) {
      draggedId = card.dataset.id;
      card.style.opacity = '.45';
      card.style.transform = 'rotate(2deg)';
    }
  });

  document.addEventListener('dragend', e => {
    const card = e.target.closest('.kanban-card[draggable]');
    if (card) { card.style.opacity = ''; card.style.transform = ''; }
    draggedId = null;
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  });

  document.addEventListener('dragover', e => {
    e.preventDefault();
    const col = e.target.closest('.kanban-column');
    if (col) {
      document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
      col.classList.add('drag-over');
    }
  });

  document.addEventListener('drop', e => {
    e.preventDefault();
    const col = e.target.closest('.kanban-column');
    if (!col || !draggedId) return;
    const newStatus = col.dataset.status;
    let items = loadItems();
    const item = items.find(i => i.id === draggedId);
    if (item && item.status !== newStatus) {
      item.status = newStatus;
      item.updatedAt = new Date().toISOString();
      saveItems(items);
      addActivity(`Tarea movida a <strong>${newStatus.replace('_',' ')}</strong>: ${item.title}`);
      showToast('Estado actualizado ✓');
      refreshAll();
    }
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  });
}

// ================================================================
// ===== ALERTAS EXTENDIDAS (Extintores + EPP) =====
// ================================================================
const _origCheckAlerts = window.checkDailyAlerts || function(){};
function extendedAlerts() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const in30str = in30.toISOString().split('T')[0];

  // Extintores vencidos
  loadExtintores().forEach(e => {
    if (e.proximarecarga && e.proximarecarga <= todayStr && e.estado !== 'dado_baja') {
      const alertsContainer = document.getElementById('alertsContainer');
      if (alertsContainer) {
        const div = document.createElement('div');
        div.style.cssText = 'background:rgba(240,91,122,.1);border:1px solid rgba(240,91,122,.3);border-radius:10px;padding:.9rem;display:flex;gap:.7rem;align-items:flex-start;';
        div.innerHTML = `<span class="material-icons-round" style="color:var(--danger);font-size:1.3rem;flex-shrink:0">fire_extinguisher</span><div><strong>Extintor ${e.codigo}</strong> — Recarga vencida<br><span style="font-size:.78rem;color:var(--text-secondary)">${e.ubicacion} · ${e.embarcacion || ''}</span></div>`;
        alertsContainer.appendChild(div);
      }
    }
  });

  // EPP vencidos
  loadEPP().forEach(e => {
    if (e.vencimiento && e.vencimiento <= todayStr) {
      const alertsContainer = document.getElementById('alertsContainer');
      if (alertsContainer) {
        const div = document.createElement('div');
        div.style.cssText = 'background:rgba(240,91,122,.1);border:1px solid rgba(240,91,122,.3);border-radius:10px;padding:.9rem;display:flex;gap:.7rem;align-items:flex-start;';
        div.innerHTML = `<span class="material-icons-round" style="color:var(--danger);font-size:1.3rem;flex-shrink:0">security</span><div><strong>EPP Vencido:</strong> ${e.trabajador}<br><span style="font-size:.78rem;color:var(--text-secondary)">${e.tipo} · ${e.area || ''}</span></div>`;
        alertsContainer.appendChild(div);
      }
    }
  });
}

// ================================================================
// ===== HOOK refreshAll extendido =====
// ================================================================
const _origRefreshAll = window.refreshAll;
// Parchamos refreshAll para incluir nuevos módulos
const _patchRefreshAll = () => {
  refreshAccidentes();
  refreshExtintores();
  refreshEPP();
};
// Inicialización de módulos extra — se ejecuta después de init()
window._initExtraModules = function() {
  // Patch refreshAll
  const origRA = window.refreshAll;
  if (origRA) {
    window.refreshAll = function() {
      origRA();
      _patchRefreshAll();
    };
  }
  initKanbanDragDrop();
  setTimeout(extendedAlerts, 1500);
  _patchRefreshAll();
};

// ================================================================
// ===== SINCRONIZAR NUEVOS MÓDULOS CON FIREBASE =====
// ================================================================
// Extender syncFromCloud para nuevos módulos
const _pairExtras = [
  ['store/accidentes', ACC_KEY],
  ['store/extintores', EXT_KEY],
  ['store/epp', EPP_KEY],
];
// Hook en setupRealtimeSync — escuchar cambios en tiempo real
setTimeout(() => {
  if (typeof firestore !== 'undefined') {
    _pairExtras.forEach(([docPath, localKey]) => {
      firestore.doc(docPath).onSnapshot(doc => {
        if (doc.exists && doc.data()?.data?.length > 0) {
          const cloudData = JSON.stringify(doc.data().data);
          const localData = localStorage.getItem(localKey);
          if (cloudData !== localData) {
            localStorage.setItem(localKey, cloudData);
            _patchRefreshAll();
          }
        }
      }, err => console.warn('[Cloud] Extra listener error:', err));
    });
  }
}, 3000);


// ================================================================
// ===== DASHBOARD MEJORADO — KPIs + Tendencia + Índices =====
// ================================================================

let myTrendChart = null;

function renderKPIRow() {
  const el = document.getElementById('kpiRow');
  if (!el) return;
  const today = new Date().toISOString().split('T')[0];
  const items = loadItems();
  const accs = loadAccidentes();
  const exts = loadExtintores();
  const epps = loadEPP();

  const vencidosItems = items.filter(i => i.status !== 'completada' && i.dueDate && i.dueDate < today).length;
  const embKeys = ['emb-maria-jose','emb-alvarito','emb-aukan','emb-don-humberto','emb-lafquen'];
  const embDocsVenc = typeof loadFilesMeta === 'function'
    ? loadFilesMeta().filter(f => embKeys.includes(f.entityKey) && f.vencimiento && f.vencimiento < today).length
    : 0;
  const extVenc = exts.filter(e => e.proximarecarga && e.proximarecarga <= today && e.estado !== 'dado_baja').length;
  const eppVenc = epps.filter(e => e.vencimiento && e.vencimiento <= today).length;
  const accAbiertos = accs.filter(a => a.estado === 'abierto' || a.estado === 'en_investigacion').length;
  const totalItems = items.length;
  const completados = items.filter(i => i.status === 'completada').length;
  const cumplimiento = totalItems > 0 ? Math.round((completados / totalItems) * 100) : 0;

  const kpis = [
    { icon: 'speed', label: 'Cumplimiento General', value: cumplimiento + '%', color: cumplimiento >= 70 ? 'var(--success)' : cumplimiento >= 40 ? 'var(--warning)' : 'var(--danger)', bg: 'rgba(16,217,160,.08)' },
    { icon: 'warning_amber', label: 'Tareas Vencidas', value: vencidosItems, color: 'var(--danger)', bg: 'rgba(240,91,122,.08)' },
    { icon: 'local_hospital', label: 'Accidentes Activos', value: accAbiertos, color: accAbiertos > 0 ? 'var(--danger)' : 'var(--success)', bg: 'rgba(240,91,122,.08)' },
    { icon: 'fire_extinguisher', label: 'Extintores Vencidos', value: extVenc, color: extVenc > 0 ? 'var(--warning)' : 'var(--success)', bg: 'rgba(245,166,35,.08)' },
    { icon: 'directions_boat', label: 'Docs Emb. Vencidos', value: embDocsVenc, color: embDocsVenc > 0 ? 'var(--warning)' : 'var(--success)', bg: 'rgba(245,166,35,.08)' },
  ];

  el.innerHTML = kpis.map(k => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:.9rem 1rem;display:flex;align-items:center;gap:.75rem;transition:.2s" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="width:38px;height:38px;border-radius:9px;background:${k.bg};display:grid;place-items:center;flex-shrink:0">
        <span class="material-icons-round" style="color:${k.color};font-size:1.2rem">${k.icon}</span>
      </div>
      <div>
        <div style="font-size:1.5rem;font-weight:900;color:${k.color};line-height:1">${k.value}</div>
        <div style="font-size:.72rem;color:var(--text-muted);font-weight:500;margin-top:.1rem">${k.label}</div>
      </div>
    </div>`).join('');
}

function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx || !window.Chart) return;

  const items = loadItems();
  const months = [];
  const completedData = [];
  const createdData = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
    months.push(label);
    const prefix = `${y}-${m}`;
    completedData.push(items.filter(it => it.status === 'completada' && it.updatedAt?.startsWith(prefix)).length);
    createdData.push(items.filter(it => it.createdAt?.startsWith(prefix)).length);
  }

  if (myTrendChart) myTrendChart.destroy();
  myTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Creadas', data: createdData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,.12)', tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: '#8b5cf6' },
        { label: 'Completadas', data: completedData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.1)', tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: '#22c55e' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#71717a', font: { size: 11 }, padding: 12 } } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: '#71717a' }, grid: { color: 'rgba(255,255,255,.04)' } },
        x: { ticks: { color: '#71717a', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function renderIndicesAccidentabilidad() {
  const el = document.getElementById('indicesContent');
  if (!el) return;
  const accs = loadAccidentes();
  const personal = loadPersonal();

  // Índices Ley 16.744 — cálculo simplificado para el año en curso
  const yearAccs = accs.filter(a => a.fecha && a.fecha.startsWith('2026') && a.tipo === 'accidente_trabajo');
  const N = personal.length || 1; // trabajadores
  const HHT = N * 8 * 220; // horas hombre trabajadas estimadas (220 días/año)
  const diasPerdidos = yearAccs.reduce((sum, a) => sum + (parseInt(a.reposo) || 0), 0);

  const tF = yearAccs.length > 0 ? ((yearAccs.length / HHT) * 1000000).toFixed(2) : '0.00'; // Tasa Frecuencia
  const tG = diasPerdidos > 0 ? ((diasPerdidos / HHT) * 1000000).toFixed(2) : '0.00'; // Tasa Gravedad
  const tA = (parseFloat(tF) * parseFloat(tG) / 1000).toFixed(4); // Tasa Accidentabilidad

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem">
      ${[
        { label: 'Tasa de Frecuencia', value: tF, sub: 'Accidentes x 10⁶ HHT', color: 'var(--warning)', icon: 'trending_up' },
        { label: 'Tasa de Gravedad', value: tG, sub: 'Días perdidos x 10⁶ HHT', color: 'var(--danger)', icon: 'healing' },
        { label: 'Tasa de Accidentabilidad', value: tA, sub: 'TF × TG / 1000', color: 'var(--info)', icon: 'analytics' },
        { label: 'Días Perdidos 2026', value: diasPerdidos, sub: 'Total días de reposo', color: 'var(--text-secondary)', icon: 'event_busy' }
      ].map(k => `
        <div style="background:var(--bg-hover);border-radius:10px;padding:.8rem;text-align:center">
          <span class="material-icons-round" style="color:${k.color};font-size:1.3rem">${k.icon}</span>
          <div style="font-size:1.4rem;font-weight:900;color:${k.color};margin:.2rem 0">${k.value}</div>
          <div style="font-size:.72rem;font-weight:700;color:var(--text-primary)">${k.label}</div>
          <div style="font-size:.65rem;color:var(--text-muted)">${k.sub}</div>
        </div>`).join('')}
    </div>
    <div style="font-size:.72rem;color:var(--text-muted);text-align:center;padding:.5rem;border-top:1px solid var(--border)">
      Basado en ${N} trabajadores · Año 2026 · Ley 16.744
    </div>`;
}

// Hook en refreshDashboard para agregar nuevos elementos
const _origRefreshDashboard = window.refreshDashboard;
function patchedRefreshDashboard(items) {
  if (typeof _origRefreshDashboard === 'function') _origRefreshDashboard(items);
  renderKPIRow();
  renderTrendChart();
  renderIndicesAccidentabilidad();
}

// ================================================================
// ===== MÓDULO CARTA GANTT =====
// ================================================================
const GANTT_KEY = 'prevrisk_gantt';

function loadGantt() { try { return JSON.parse(localStorage.getItem(GANTT_KEY)) || []; } catch { return []; } }
function saveGantt(data) { localStorage.setItem(GANTT_KEY, JSON.stringify(data)); cloudSave('store/gantt', data); }

const GANTT_COLORS = {
  capacitacion: '#8b5cf6', inspeccion: '#eab308', documento: '#38bdf8',
  auditoria: '#a855f7', simulacro: '#ef4444', reunion: '#22c55e', otro: '#71717a'
};
const GANTT_LABELS = {
  capacitacion: 'Capacitación', inspeccion: 'Inspección', documento: 'Documento',
  auditoria: 'Auditoría', simulacro: 'Simulacro', reunion: 'Reunión SST', otro: 'Otro'
};

function renderGantt() {
  const container = document.getElementById('ganttChart');
  const legend = document.getElementById('ganttLegend');
  if (!container) return;

  const list = loadGantt();

  // Legend
  if (legend) {
    legend.innerHTML = Object.entries(GANTT_LABELS).map(([k, v]) =>
      `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.72rem;color:var(--text-secondary)">
        <span style="width:10px;height:10px;border-radius:3px;background:${GANTT_COLORS[k]};flex-shrink:0"></span>${v}
      </span>`).join('');
  }

  if (list.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted)">
      <span class="material-icons-round" style="font-size:3rem;display:block;margin-bottom:.5rem">calendar_month</span>
      Sin actividades. Agrega la primera con "+ Nueva Actividad"
    </div>`;
    return;
  }

  // Calcular rango de meses
  const allDates = list.flatMap(g => [g.inicio, g.termino]).filter(Boolean).sort();
  const start = new Date(allDates[0]); start.setDate(1);
  const end = new Date(allDates[allDates.length - 1]); end.setMonth(end.getMonth() + 1); end.setDate(0);

  // Generar meses
  const months = [];
  const cur = new Date(start);
  while (cur <= end) {
    months.push({ y: cur.getFullYear(), m: cur.getMonth(), label: cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }) });
    cur.setMonth(cur.getMonth() + 1);
  }

  const totalDays = Math.ceil((end - start) / 86400000) + 1;
  const dayW = Math.max(28, Math.floor(880 / totalDays));

  let html = `<div style="font-family:'DM Sans',system-ui,sans-serif;">`;

  // Header meses
  html += `<div style="display:flex;margin-left:220px;margin-bottom:.3rem;">`;
  months.forEach(mo => {
    const daysInMonth = new Date(mo.y, mo.m + 1, 0).getDate();
    const w = daysInMonth * dayW;
    html += `<div style="width:${w}px;flex-shrink:0;text-align:center;font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;border-right:1px solid var(--border);padding:.2rem 0">${mo.label}</div>`;
  });
  html += `</div>`;

  // Filas
  const sorted = [...list].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
  sorted.forEach(g => {
    if (!g.inicio || !g.termino) return;
    const gStart = new Date(g.inicio);
    const gEnd = new Date(g.termino);
    const offsetDays = Math.ceil((gStart - start) / 86400000);
    const durDays = Math.ceil((gEnd - gStart) / 86400000) + 1;
    const offsetPx = offsetDays * dayW;
    const widthPx = Math.max(durDays * dayW, 40);
    const color = GANTT_COLORS[g.categoria] || '#71717a';
    const avance = parseInt(g.avance) || 0;

    const estadoIcon = { pendiente: '⏳', en_progreso: '🔄', completada: '✅', atrasada: '⚠️' }[g.estado] || '';

    html += `<div style="display:flex;align-items:center;margin-bottom:.45rem;min-height:36px" onclick="openGanttModal('${g.id}')" style="cursor:pointer">
      <div style="width:220px;flex-shrink:0;padding-right:.8rem;overflow:hidden;">
        <div style="font-size:.78rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" title="${g.nombre}">${estadoIcon} ${g.nombre}</div>
        <div style="font-size:.65rem;color:var(--text-muted)">${g.responsable || ''}</div>
      </div>
      <div style="flex:1;position:relative;height:32px;background:var(--bg-hover);border-radius:4px;overflow:hidden;">
        <div style="position:absolute;left:${offsetPx}px;width:${widthPx}px;height:100%;background:${color};border-radius:6px;opacity:.85;display:flex;align-items:center;padding:0 .5rem;cursor:pointer;transition:.2s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.85'">
          <div style="position:absolute;left:0;top:0;height:100%;width:${avance}%;background:rgba(255,255,255,.25);border-radius:6px;transition:.5s"></div>
          <span style="font-size:.68rem;font-weight:700;color:#fff;white-space:nowrap;position:relative;z-index:1">${g.nombre.slice(0,20)}${g.nombre.length>20?'…':''} ${avance > 0 ? '('+avance+'%)' : ''}</span>
        </div>
      </div>
    </div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function openGanttModal(id) {
  const form = document.getElementById('ganttForm');
  if (!form) return;
  form.reset();
  document.getElementById('ganttId').value = '';
  document.getElementById('ganttBtnDelete').style.display = 'none';
  document.getElementById('ganttAvance').value = 0;

  if (id) {
    const g = loadGantt().find(x => x.id === id);
    if (g) {
      document.getElementById('ganttId').value = g.id;
      document.getElementById('ganttNombre').value = g.nombre || '';
      document.getElementById('ganttResponsable').value = g.responsable || '';
      document.getElementById('ganttCategoria').value = g.categoria || 'capacitacion';
      document.getElementById('ganttInicio').value = g.inicio || '';
      document.getElementById('ganttTermino').value = g.termino || '';
      document.getElementById('ganttEstado').value = g.estado || 'pendiente';
      document.getElementById('ganttAvance').value = g.avance || 0;
      document.getElementById('ganttObs').value = g.observaciones || '';
      document.getElementById('ganttBtnDelete').style.display = 'block';
    }
  }
  document.getElementById('ganttModalOverlay').classList.add('active');
}

function saveGanttForm() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (!get('ganttNombre') || !get('ganttInicio') || !get('ganttTermino')) {
    showToast('Nombre, inicio y término son obligatorios', 'error'); return;
  }
  const id = get('ganttId') || 'gantt_' + Date.now();
  const data = {
    id, nombre: get('ganttNombre'), responsable: get('ganttResponsable'),
    categoria: get('ganttCategoria'), inicio: get('ganttInicio'), termino: get('ganttTermino'),
    estado: get('ganttEstado'), avance: parseInt(get('ganttAvance')) || 0,
    observaciones: get('ganttObs'), updatedAt: new Date().toISOString()
  };
  let list = loadGantt();
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) list[idx] = data; else list.push(data);
  saveGantt(list);
  document.getElementById('ganttModalOverlay').classList.remove('active');
  showToast('Actividad guardada');
  addActivity(`Gantt: <strong>${data.nombre}</strong> actualizado`);
  renderGantt();
}

function deleteGanttForm() {
  const id = document.getElementById('ganttId').value;
  if (!id || !confirm('¿Eliminar esta actividad del Gantt?')) return;
  saveGantt(loadGantt().filter(x => x.id !== id));
  document.getElementById('ganttModalOverlay').classList.remove('active');
  showToast('Actividad eliminada');
  renderGantt();
}

// Eventos Gantt
(function() {
  const ov = document.getElementById('ganttModalOverlay');
  if (!ov) return;
  document.getElementById('ganttModalClose')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('ganttBtnCancel')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('ganttBtnSave')?.addEventListener('click', saveGanttForm);
  document.getElementById('ganttBtnDelete')?.addEventListener('click', deleteGanttForm);
  document.getElementById('btnNewGantt')?.addEventListener('click', () => openGanttModal(null));
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); });
})();

window.openGanttModal = openGanttModal;

// Export Gantt CSV
document.getElementById('btnExportGantt')?.addEventListener('click', () => {
  const list = loadGantt();
  if (!list.length) { showToast('Sin datos para exportar', 'error'); return; }
  let csv = '\uFEFFActividad;Responsable;Categoría;Inicio;Término;Estado;Avance%;Observaciones\r\n';
  list.forEach(g => {
    csv += `"${g.nombre}";"${g.responsable||''}";"${GANTT_LABELS[g.categoria]||g.categoria}";"${g.inicio}";"${g.termino}";"${g.estado}";"${g.avance||0}";"${g.observaciones||''}"\r\n`;
  });
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `Gantt_PrevRisk_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('Gantt exportado');
});

// ================================================================
// ===== FICHAS DE EMBARCACIONES =====
// ================================================================
const EMBARCACIONES_DATA = {
  'emb-maria-jose': {
    nombre: 'María José', estado: 'activa', tipo: 'Embarcación de Trabajo',
    matricula: 'PG-50-09', eslora: '18.5m', manga: '5.2m', calado: '1.8m',
    motor: 'Volvo Penta D6 — 370 HP', tripulacion: 6, zona: 'Zona Aysén',
    puerto: 'Puerto Melinka', patente: 'Vigente', armador: 'Comercial Lafquen Ltda.',
    aseguradora: 'HDI Seguros', vencSeguro: '2026-12-31', vencDirectemar: '2026-08-15',
    observaciones: 'Embarcación principal de buceo comercial. Equipada con compresor de buceo y cámara hiperbárica portátil.'
  },
  'emb-alvarito': {
    nombre: 'Alvarito', estado: 'activa', tipo: 'Embarcación de Apoyo',
    matricula: 'PG-48-11', eslora: '15.0m', manga: '4.8m', calado: '1.5m',
    motor: 'Cummins QSB 6.7 — 320 HP', tripulacion: 4, zona: 'Zona Aysén',
    puerto: 'Puerto Chacabuco', patente: 'Vigente', armador: 'Comercial Lafquen Ltda.',
    aseguradora: 'HDI Seguros', vencSeguro: '2026-11-30', vencDirectemar: '2026-09-20',
    observaciones: 'Embarcación de apoyo en operaciones de buceo. Usada para transporte de personal y equipos.'
  },
  'emb-aukan': {
    nombre: 'Aukan', estado: 'activa', tipo: 'Lancha Motor',
    matricula: 'PAR-2230 / CA-3942', eslora: '17.9m', manga: '6.0m', calado: '2.3m',
    motor: 'DAEWOO 230 HP × 2', tripulacion: 3,
    capMaxPersonas: 14, capPasajeros: 11,
    zona: 'Aguas Interiores hasta 12 millas', puerto: 'Punta Arenas (Base: Chacabuco)',
    patente: 'Vigente', armador: 'Comercial Lafquen Limitada',
    aseguradora: '—', vencSeguro: null,
    vencDirectemar: '2027-03-04',
    ultimaCarena: '2022-02-14',
    observaciones: 'Cert. Navegabilidad A-2186024 vigente hasta 04/03/2027. SWL Brazo Hidráulico Palfinger PK23500A (3.800 kg) vence 14/01/2027. SWL Virador y Winche vencen 14/01/2027. Tablilla Desvío vence 15/12/2026. Última carena: 14-02-2022.'
  },
  'emb-don-humberto': {
    nombre: 'Don Humberto', estado: 'parada', tipo: 'Embarcación de Carga',
    matricula: 'PG-45-08', eslora: '22.0m', manga: '6.2m', calado: '2.4m',
    motor: 'Caterpillar C18 — 600 HP', tripulacion: 5, zona: 'Zona Aysén',
    puerto: 'Varadero Melinka', patente: 'Vencida', armador: 'Comercial Lafquen Ltda.',
    aseguradora: 'HDI Seguros', vencSeguro: '2026-03-15', vencDirectemar: '2025-12-01',
    observaciones: 'En varadero por mantención mayor de casco y motor. Estimado retorno: julio 2026.'
  },
  'emb-lafquen': {
    nombre: 'Lafquen', estado: 'parada', tipo: 'Embarcación de Trabajo',
    matricula: 'PG-41-06', eslora: '17.0m', manga: '5.0m', calado: '1.7m',
    motor: 'Volvo Penta D4 — 220 HP', tripulacion: 4, zona: 'Zona Aysén',
    puerto: 'Varadero Chacabuco', patente: 'Por Renovar', armador: 'Comercial Lafquen Ltda.',
    aseguradora: 'Mapfre Chile', vencSeguro: '2026-06-30', vencDirectemar: '2026-04-10',
    observaciones: 'Parada por renovación de patente y revisión de sistema eléctrico. Estimado retorno: agosto 2026.'
  }
};

const EMB_CHECKLIST = [
  'Certificado de Matrícula vigente',
  'Permiso de Zarpe al día',
  'Certificado de Seguridad (Directemar)',
  'Inspección técnica al día',
  'Botiquín completo y vigente',
  'Extintores cargados y vigentes',
  'Chalecos salvavidas para tripulación',
  'Balsa salvavidas certificada',
  'Radio VHF operativa',
  'GPS / Cartas náuticas actualizadas',
  'Plan de emergencia a bordo',
  'Registro de bitácora al día'
];

function renderEmbarcacion(viewId) {
  const emb = EMBARCACIONES_DATA[viewId];
  if (!emb) return;
  const today = new Date().toISOString().split('T')[0]; // FIX: definir today localmente

  const title = document.getElementById('embDetailTitle');
  const badge = document.getElementById('embDetailBadge');
  if (title) title.textContent = emb.nombre;
  if (badge) {
    badge.textContent = emb.estado === 'activa' ? '🟢 Activa' : '🟡 Parada';
    badge.style.cssText = `font-size:.8rem;padding:.3rem .8rem;border-radius:8px;font-weight:700;background:${emb.estado==='activa'?'rgba(16,217,160,.15)':'rgba(245,166,35,.15)'};color:${emb.estado==='activa'?'var(--success)':'var(--warning)'}`;
  }

  const statsEl = document.getElementById('embDetailStats');
  if (statsEl) {
    const docs = loadFilesMeta().filter(f => f.entityKey === viewId);
    const segVenc = emb.vencSeguro < today ? 'color:var(--danger)' : emb.vencSeguro < today.slice(0,7)+'-30' ? 'color:var(--warning)' : 'color:var(--success)';
    const dirVenc = emb.vencDirectemar < today ? 'color:var(--danger)' : 'color:var(--success)';

    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-icon" style="background:rgba(91,138,240,.1);color:var(--accent)"><span class="material-icons-round">straighten</span></div><div><span class="stat-value">${emb.eslora}</span><span class="stat-label">Eslora</span></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:rgba(16,217,160,.1);color:var(--success)"><span class="material-icons-round">badge</span></div><div><span class="stat-value" style="font-size:1rem">${emb.matricula}</span><span class="stat-label">Matrícula</span></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:rgba(91,184,240,.1);color:var(--info)"><span class="material-icons-round">group</span></div><div><span class="stat-value">${emb.tripulacion}</span><span class="stat-label">Tripulación</span></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:rgba(245,166,35,.1);color:var(--warning)"><span class="material-icons-round">folder</span></div><div><span class="stat-value">${docs.length}</span><span class="stat-label">Documentos</span></div></div>
    `;
  }

  const grid = document.getElementById('embDetailGrid');
  if (grid) {
    grid.innerHTML = `
      <div class="panel">
        <div class="panel-header"><h3>🚢 Ficha Técnica</h3></div>
        <div class="panel-body">
          ${[
            ['Nombre', emb.nombre], ['Matrícula', emb.matricula], ['Tipo', emb.tipo],
            ['Eslora', emb.eslora], ['Manga', emb.manga], ['Calado', emb.calado],
            ['Motor', emb.motor], ['Tripulación', emb.tripulacion + ' personas'],
            ['Zona', emb.zona], ['Puerto Base', emb.puerto], ['Armador', emb.armador]
          ].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:.45rem 0;border-bottom:1px solid var(--border);font-size:.83rem">
            <span style="color:var(--text-muted);font-weight:500">${k}</span>
            <span style="font-weight:600;text-align:right;max-width:55%">${v||'—'}</span>
          </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h3>📋 Vigencias y Seguros</h3></div>
        <div class="panel-body">
          ${[
            ['Patente', emb.patente, emb.patente==='Vigente'?'var(--success)':emb.patente==='Por Renovar'?'var(--warning)':'var(--danger)'],
            ['Aseguradora', emb.aseguradora, 'var(--text-primary)'],
            ['Venc. Seguro', emb.vencSeguro ? formatDate(emb.vencSeguro) : '—', emb.vencSeguro < new Date().toISOString().split('T')[0] ? 'var(--danger)' : 'var(--success)'],
            ['Venc. Directemar', emb.vencDirectemar ? formatDate(emb.vencDirectemar) : '—', emb.vencDirectemar < new Date().toISOString().split('T')[0] ? 'var(--danger)' : 'var(--success)'],
          ].map(([k,v,c]) => `<div style="display:flex;justify-content:space-between;padding:.45rem 0;border-bottom:1px solid var(--border);font-size:.83rem">
            <span style="color:var(--text-muted);font-weight:500">${k}</span>
            <span style="font-weight:700;color:${c}">${v||'—'}</span>
          </div>`).join('')}
          <div style="margin-top:1rem;padding:.75rem;background:var(--bg-hover);border-radius:9px;font-size:.8rem;color:var(--text-secondary);line-height:1.5">
            <strong style="color:var(--text-primary)">Observaciones:</strong><br>${emb.observaciones||'Sin observaciones'}
          </div>
        </div>
      </div>
    `;
  }

  // Tabla de documentos
  renderEmbDocumentos(viewId);

  const checkEl = document.getElementById('embDetailChecklist');
  if (checkEl) {
    const saved = JSON.parse(localStorage.getItem('prevrisk_emb_check_' + viewId) || '{}');
    const doneCount = Object.values(saved).filter(Boolean).length;
    checkEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;font-size:.8rem;color:var(--text-muted);border-bottom:1px solid var(--border);margin-bottom:.3rem">
        <span>${doneCount}/${EMB_CHECKLIST.length} requisitos cumplidos</span>
        <span style="font-weight:700;color:${doneCount===EMB_CHECKLIST.length?'var(--success)':doneCount>EMB_CHECKLIST.length*.7?'var(--warning)':'var(--danger)'}">${Math.round(doneCount/EMB_CHECKLIST.length*100)}%</span>
      </div>` +
    EMB_CHECKLIST.map((item, i) => {
      const checked = saved[i] || false;
      return `<div class="checklist-item ${checked?'done':''}" style="cursor:pointer">
        <input type="checkbox" id="embChk_${i}" ${checked?'checked':''} onchange="saveEmbCheck('${viewId}',${i},this.checked)">
        <label for="embChk_${i}">${item}</label>
      </div>`;
    }).join('');
  }
}

// Botón Cargar Archivo en vista embarcación
// [bloque btnUploadFileEmb movido a init unificado]

function renderEmbDocumentos(viewId) {
  const tbody = document.getElementById('embDocBody');
  const countEl = document.getElementById('embDocCount');
  if (!tbody) return;

  const docs = loadFilesMeta().filter(f => f.entityKey === viewId);
  if (countEl) countEl.textContent = docs.length + ' documento(s)';

  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Sin documentos cargados. Usa "Cargar Archivo" para agregar.</td></tr>';
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  tbody.innerHTML = docs.map(f => {
    const ext = (f.name || '').split('.').pop().toUpperCase();
    const isLink = f.isLink;
    const icon = isLink ? 'link' : (ext === 'PDF' ? 'picture_as_pdf' : ext === 'XLSX' || ext === 'XLS' ? 'table_chart' : 'insert_drive_file');
    const iconColor = isLink ? 'var(--accent)' : ext === 'PDF' ? 'var(--danger)' : ext === 'XLSX' ? 'var(--success)' : 'var(--text-secondary)';
    let estado = '', estadoClass = '';
    if (f.vencimiento) {
      if (f.vencimiento < today) { estado = 'Vencido'; estadoClass = 'doc-vencido'; }
      else if (f.vencimiento < new Date(Date.now()+30*86400000).toISOString().split('T')[0]) { estado = 'Por Vencer'; estadoClass = 'doc-por-vencer'; }
      else { estado = 'Vigente'; estadoClass = 'doc-vigente'; }
    } else { estado = 'Sin venc.'; estadoClass = 'doc-sin-venc'; }

    const action = isLink
      ? `<a href="${f.url}" target="_blank" class="btn-icon" title="Abrir enlace"><span class="material-icons-round" style="font-size:1rem;color:var(--accent)">open_in_new</span></a>`
      : `<button onclick="downloadEmbFile('${f.id}')" class="btn-icon" title="Descargar"><span class="material-icons-round" style="font-size:1rem">download</span></button>`;

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span class="material-icons-round" style="color:${iconColor};font-size:1.1rem">${icon}</span>
          <span style="font-weight:600;font-size:.83rem">${f.name || f.descripcion || '—'}</span>
        </div>
        ${f.descripcion && f.descripcion !== f.name ? `<div style="font-size:.72rem;color:var(--text-muted)">${f.descripcion}</div>` : ''}
      </td>
      <td><span style="font-size:.72rem;font-weight:700;color:var(--text-muted)">${isLink ? 'ENLACE' : ext}</span></td>
      <td style="font-size:.78rem;color:var(--text-muted)">${f.uploadedAt ? formatDate(f.uploadedAt.split('T')[0]) : '—'}</td>
      <td style="font-size:.78rem">${f.vencimiento ? formatDate(f.vencimiento) : '—'}</td>
      <td><span class="doc-status ${estadoClass}">${estado}</span></td>
      <td><div class="table-actions">
        ${action}
        <button onclick="deleteEmbFile('${f.id}','${viewId}')" class="btn-icon" title="Eliminar"><span class="material-icons-round" style="font-size:1rem;color:var(--danger)">delete</span></button>
      </div></td>
    </tr>`;
  }).join('');
}

window.downloadEmbFile = function(fileId) {
  showToast('Descargando archivo...'); // El download real depende del IndexedDB
};

window.deleteEmbFile = function(fileId, viewId) {
  if (!confirm('¿Eliminar este documento?')) return;
  let meta = loadFilesMeta().filter(f => f.id !== fileId);
  saveFilesMeta(meta);
  renderEmbDocumentos(viewId);
  showToast('Documento eliminado');
};

window.saveEmbCheck = function(viewId, idx, val) {
  const key = 'prevrisk_emb_check_' + viewId;
  const saved = JSON.parse(localStorage.getItem(key) || '{}');
  saved[idx] = val;
  localStorage.setItem(key, JSON.stringify(saved));
  renderEmbarcacion(viewId);
};

// [listener click emb eliminado — renderEmbarcacion se llama desde navigateTo]

// ================================================================
// ===== BUSCADOR EXTENDIDO — Extintores, EPP, Accidentes, Gantt =====
// ================================================================
// Se extiende el sistema de búsqueda existente
const _origBuildSearchIndex = window.buildSearchIndex;
window.getExtraSearchResults = function(q) {
  const ql = q.toLowerCase();
  const results = [];

  // Accidentes
  loadAccidentes().filter(a => (a.nombre || '').toLowerCase().includes(ql) || (a.descripcion || '').toLowerCase().includes(ql)).slice(0, 3).forEach(a => {
    results.push({ type: 'accidente', title: a.nombre, subtitle: `${a.tipo?.replace(/_/g,' ')} · ${a.fecha || ''}`, icon: 'local_hospital', color: 'var(--danger)', action: () => navigateTo('acc-estadisticas') });
  });

  // Extintores
  loadExtintores().filter(e => (e.codigo || '').toLowerCase().includes(ql) || (e.ubicacion || '').toLowerCase().includes(ql)).slice(0, 3).forEach(e => {
    results.push({ type: 'extintor', title: `EXT: ${e.codigo}`, subtitle: `${e.tipo} · ${e.ubicacion}`, icon: 'fire_extinguisher', color: 'var(--warning)', action: () => navigateTo('extintores') });
  });

  // EPP
  loadEPP().filter(ep => (ep.trabajador || '').toLowerCase().includes(ql) || (ep.tipo || '').toLowerCase().includes(ql)).slice(0, 3).forEach(ep => {
    results.push({ type: 'epp', title: ep.trabajador, subtitle: `EPP: ${ep.tipo}`, icon: 'security', color: 'var(--accent-light)', action: () => navigateTo('epp') });
  });

  return results;
};

// ================================================================
// ===== HOOK FINAL: Patch refreshAll y navigateTo =====
// ================================================================
// [bloque refreshAll patch movido a init unificado]


// ================================================================
// ===== NOTIFICACIONES PUSH =====
// ================================================================
const NOTIF_KEY = 'prevrisk_notif_config';

function initNotificaciones() {
  if (!('Notification' in window)) return;

  // Panel de configuración de notificaciones
  if (!document.getElementById('notifPanel')) {
    const panel = document.createElement('div');
    panel.id = 'notifPanel';
    panel.style.cssText = `
      position:fixed;top:70px;right:1rem;width:320px;
      background:var(--bg-card);border:1px solid var(--border-strong);
      border-radius:14px;box-shadow:var(--shadow);z-index:500;
      display:none;animation:slideDownFade .2s ease;overflow:hidden;
    `;
    panel.innerHTML = `
      <div style="padding:1rem 1.2rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <h4 style="font-size:.95rem;font-weight:700;display:flex;align-items:center;gap:.4rem">
          <span class="material-icons-round" style="color:var(--accent);font-size:1.1rem">notifications_active</span>
          Notificaciones Push
        </h4>
        <button onclick="document.getElementById('notifPanel').style.display='none'" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem">×</button>
      </div>
      <div style="padding:1rem 1.2rem" id="notifPanelBody">
        <p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:1rem">
          Recibe alertas en tu dispositivo cuando algo esté por vencer.
        </p>
        <button id="btnActivarNotif" class="btn-primary" style="width:100%;justify-content:center;margin-bottom:.75rem">
          <span class="material-icons-round">notifications_active</span> Activar Notificaciones
        </button>
        <div id="notifStatus" style="font-size:.75rem;text-align:center;color:var(--text-muted)"></div>
        <div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:.75rem">
          <p style="font-size:.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:.5rem">ALERTAR CUANDO:</p>
          ${[
            ['notifTareas', 'Tareas vencidas'],
            ['notifExtintores', 'Extintores por recargar'],
            ['notifEPP', 'EPP por vencer'],
            ['notifExamenes', 'Exámenes médicos por vencer'],
            ['notifAccidentes', 'Accidentes sin cerrar'],
          ].map(([id, label]) => `
            <label style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;cursor:pointer;font-size:.82rem;color:var(--text-primary)">
              <input type="checkbox" id="${id}" style="accent-color:var(--accent);width:16px;height:16px" checked>
              ${label}
            </label>`).join('')}
        </div>
        <button id="btnTestNotif" class="btn-secondary" style="width:100%;margin-top:.75rem;justify-content:center;display:flex;align-items:center;gap:.4rem;font-size:.8rem">
          <span class="material-icons-round" style="font-size:1rem">send</span> Probar Notificación
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('btnActivarNotif')?.addEventListener('click', activarNotificaciones);
    document.getElementById('btnTestNotif')?.addEventListener('click', testNotificacion);

    // Cerrar al click fuera
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target.id !== 'btnNotif' && !e.target.closest('#btnNotif')) {
        panel.style.display = 'none';
      }
    });
  }

  updateNotifStatus();
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
}

function updateNotifStatus() {
  const statusEl = document.getElementById('notifStatus');
  const icon = document.getElementById('notifIcon');
  const btn = document.getElementById('btnActivarNotif');
  if (!statusEl) return;

  const perm = Notification.permission;
  if (perm === 'granted') {
    statusEl.innerHTML = '<span style="color:var(--success)">✓ Notificaciones activadas</span>';
    if (icon) icon.style.color = 'var(--success)';
    if (btn) { btn.textContent = '✓ Activadas'; btn.style.opacity = '.6'; btn.disabled = true; }
  } else if (perm === 'denied') {
    statusEl.innerHTML = '<span style="color:var(--danger)">✗ Bloqueadas. Actívalas en Configuración del navegador.</span>';
    if (icon) icon.style.color = 'var(--danger)';
  } else {
    statusEl.innerHTML = 'Haz click en "Activar" para recibir alertas.';
  }
}

function activarNotificaciones() {
  if (!('Notification' in window)) {
    showToast('Tu navegador no soporta notificaciones', 'error'); return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      showToast('¡Notificaciones activadas! 🔔');
      updateNotifStatus();
      enviarNotificacionPush('PrevRisk', '¡Notificaciones activadas! Te avisaremos de vencimientos importantes.', 'icon-192.png');
      programarNotificaciones();
    } else {
      showToast('Notificaciones denegadas', 'error');
      updateNotifStatus();
    }
  });
}

function testNotificacion() {
  if (Notification.permission !== 'granted') {
    showToast('Primero activa las notificaciones', 'error'); return;
  }
  enviarNotificacionPush(
    '🧯 Extintor EXT-001 — Recarga Vencida',
    'El extintor de Cubierta Popa / María José requiere recarga urgente.',
    'icon-192.png'
  );
  showToast('Notificación de prueba enviada');
}

function enviarNotificacionPush(titulo, cuerpo, icon) {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(titulo, { body: cuerpo, icon: icon || 'icon-192.png', badge: 'icon-192.png' });
  } catch(e) { console.warn('Notif error:', e); }
}

function programarNotificaciones() {
  if (Notification.permission !== 'granted') return;
  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in7str = in7.toISOString().split('T')[0];
  const alerts = [];

  // Tareas vencidas
  if (document.getElementById('notifTareas')?.checked) {
    const venc = loadItems().filter(i => i.status !== 'completada' && i.dueDate && i.dueDate < today);
    if (venc.length) alerts.push({ t: `⚠️ ${venc.length} tarea(s) vencida(s)`, b: venc.slice(0,2).map(i=>i.title).join(', ') });
  }

  // Extintores
  if (document.getElementById('notifExtintores')?.checked) {
    const ext = loadExtintores().filter(e => e.proximarecarga && e.proximarecarga <= in7str && e.estado !== 'dado_baja');
    if (ext.length) alerts.push({ t: `🧯 ${ext.length} extintor(es) por recargar`, b: ext.slice(0,2).map(e=>e.codigo+' — '+e.ubicacion).join(', ') });
  }

  // EPP
  if (document.getElementById('notifEPP')?.checked) {
    const epp = loadEPP().filter(e => e.vencimiento && e.vencimiento <= in7str);
    if (epp.length) alerts.push({ t: `🦺 ${epp.length} EPP por vencer`, b: epp.slice(0,2).map(e=>e.trabajador+' — '+e.tipo).join(', ') });
  }

  // Accidentes sin cerrar
  if (document.getElementById('notifAccidentes')?.checked) {
    const acc = loadAccidentes().filter(a => a.estado !== 'cerrado');
    if (acc.length) alerts.push({ t: `🏥 ${acc.length} accidente(s) sin cerrar`, b: acc.slice(0,2).map(a=>a.nombre).join(', ') });
  }

  // Enviar con delay entre notificaciones
  alerts.forEach((a, i) => {
    setTimeout(() => enviarNotificacionPush(a.t, a.b), i * 2000);
  });

  if (!alerts.length) showToast('Sin alertas pendientes hoy ✓');
}

// Verificar notificaciones al inicio del día
function checkNotificacionesDiarias() {
  const hoy = new Date().toISOString().split('T')[0];
  const ultima = localStorage.getItem('prevrisk_ultima_notif');
  if (ultima === hoy) return;
  if (Notification.permission === 'granted') {
    localStorage.setItem('prevrisk_ultima_notif', hoy);
    setTimeout(programarNotificaciones, 3000);
  }
}

// ================================================================
// ===== EXPORTAR A PDF — Módulos completos =====
// ================================================================
function exportarPDF(modulo) {
  const hoy = new Date().toLocaleDateString('es-CL', { day:'2-digit', month:'long', year:'numeric' });
  let titulo = '', contenido = '';

  switch(modulo) {
    case 'dashboard': {
      const items = loadItems();
      const today = new Date().toISOString().split('T')[0];
      const pendientes = items.filter(i => i.status==='pendiente').length;
      const progreso = items.filter(i => i.status==='en_progreso').length;
      const completadas = items.filter(i => i.status==='completada').length;
      const vencidas = items.filter(i => i.status!=='completada' && i.dueDate && i.dueDate < today).length;
      const cumplimiento = items.length > 0 ? Math.round(completadas/items.length*100) : 0;
      titulo = 'Reporte General PrevRisk';
      contenido = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
          ${[['Pendientes',pendientes,'#eab308'],['En Progreso',progreso,'#38bdf8'],['Completadas',completadas,'#22c55e'],['Vencidas',vencidas,'#ef4444']].map(([l,v,c])=>`
          <div style="border:2px solid ${c};border-radius:10px;padding:1rem;text-align:center">
            <div style="font-size:2rem;font-weight:900;color:${c}">${v}</div>
            <div style="font-size:.8rem;font-weight:600;color:#555">${l}</div>
          </div>`).join('')}
        </div>
        <div style="background:#f0f3fb;border-radius:10px;padding:1rem;text-align:center;margin-bottom:1.5rem">
          <div style="font-size:2.5rem;font-weight:900;color:#8b5cf6">${cumplimiento}%</div>
          <div style="font-size:.85rem;color:#555">Cumplimiento General</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:.82rem">
          <thead><tr style="background:#f0f3fb"><th style="padding:.6rem;text-align:left;border-bottom:2px solid #ddd">Tarea</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Categoría</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Estado</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Vencimiento</th></tr></thead>
          <tbody>${items.map((i,idx)=>`<tr style="background:${idx%2?'#fff':'#f9fafc'}"><td style="padding:.5rem">${i.title}</td><td style="padding:.5rem;text-transform:capitalize">${i.category}</td><td style="padding:.5rem;text-transform:capitalize">${i.status?.replace('_',' ')}</td><td style="padding:.5rem">${i.dueDate?formatDate(i.dueDate):'—'}</td></tr>`).join('')}</tbody>
        </table>`;
      break;
    }
    case 'accidentes': {
      titulo = 'Registro de Accidentes 2026';
      const accs = loadAccidentes();
      contenido = accs.length === 0 ? '<p style="color:#888;text-align:center;padding:2rem">Sin accidentes registrados</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:.8rem">
          <thead><tr style="background:#f0f3fb"><th style="padding:.6rem;text-align:left;border-bottom:2px solid #ddd">Trabajador</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Fecha</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Tipo</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Gravedad</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Días</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Estado</th></tr></thead>
          <tbody>${accs.map((a,i)=>`<tr style="background:${i%2?'#fff':'#f9fafc'}"><td style="padding:.5rem"><strong>${a.nombre}</strong><br><small>${a.cargo||''}</small></td><td style="padding:.5rem">${a.fecha?formatDate(a.fecha):'—'}</td><td style="padding:.5rem;font-size:.75rem">${(a.tipo||'').replace(/_/g,' ')}</td><td style="padding:.5rem;text-transform:capitalize;font-weight:bold;color:${a.gravedad==='grave'||a.gravedad==='fatal'?'#f05b7a':'#f5a623'}">${a.gravedad||'—'}</td><td style="padding:.5rem;text-align:center">${a.reposo||0}</td><td style="padding:.5rem;text-transform:capitalize">${(a.estado||'').replace(/_/g,' ')}</td></tr>`).join('')}</tbody>
        </table>`;
      break;
    }
    case 'extintores': {
      titulo = 'Control de Extintores';
      const exts = loadExtintores();
      contenido = exts.length === 0 ? '<p style="color:#888;text-align:center;padding:2rem">Sin extintores registrados</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:.8rem">
          <thead><tr style="background:#f0f3fb"><th style="padding:.6rem;text-align:left;border-bottom:2px solid #ddd">Código</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Tipo</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Ubicación</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Embarcación</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Próx. Recarga</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Estado</th></tr></thead>
          <tbody>${exts.map((e,i)=>`<tr style="background:${i%2?'#fff':'#f9fafc'}"><td style="padding:.5rem"><strong>${e.codigo}</strong></td><td style="padding:.5rem">${e.tipo}</td><td style="padding:.5rem">${e.ubicacion}</td><td style="padding:.5rem">${e.embarcacion||'—'}</td><td style="padding:.5rem">${e.proximarecarga?formatDate(e.proximarecarga):'—'}</td><td style="padding:.5rem;text-transform:capitalize">${(e.estado||'').replace(/_/g,' ')}</td></tr>`).join('')}</tbody>
        </table>`;
      break;
    }
    case 'epp': {
      titulo = 'Certificaciones EPP';
      const epps = loadEPP();
      contenido = epps.length === 0 ? '<p style="color:#888;text-align:center;padding:2rem">Sin EPP registrados</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:.8rem">
          <thead><tr style="background:#f0f3fb"><th style="padding:.6rem;text-align:left;border-bottom:2px solid #ddd">Trabajador</th><th style="padding:.6rem;border-bottom:2px solid #ddd">EPP</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Marca</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Área</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Vencimiento</th><th style="padding:.6rem;border-bottom:2px solid #ddd">Estado</th></tr></thead>
          <tbody>${epps.map((e,i)=>`<tr style="background:${i%2?'#fff':'#f9fafc'}"><td style="padding:.5rem"><strong>${e.trabajador}</strong></td><td style="padding:.5rem">${e.tipo}</td><td style="padding:.5rem">${e.marca||'—'}</td><td style="padding:.5rem">${e.area||'—'}</td><td style="padding:.5rem">${e.vencimiento?formatDate(e.vencimiento):'—'}</td><td style="padding:.5rem;text-transform:capitalize">${e.estado||'—'}</td></tr>`).join('')}</tbody>
        </table>`;
      break;
    }
  }

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${titulo}</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 2rem; color: #1a1d27; background: #fff; }
      h1 { font-size: 1.4rem; font-weight: 800; color: #1a1d27; margin: 0; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #8b5cf6; padding-bottom: 1rem; margin-bottom: 1.5rem; }
      .logo { display: flex; align-items: center; gap: .6rem; }
      .logo-icon { width: 36px; height: 36px; background: linear-gradient(135deg, #8b5cf6, #6366f1); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 1rem; }
      .meta { text-align: right; font-size: .75rem; color: #666; }
      .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; text-align: center; font-size: .7rem; color: #888; }
      @media print { body { padding: 1rem; } }
    </style>
  </head><body>
    <div class="header">
      <div class="logo">
        <div class="logo-icon">PR</div>
        <div>
          <h1>${titulo}</h1>
          <div style="font-size:.75rem;color:#666;margin-top:.15rem">PrevRisk — Panel de Prevención de Riesgos</div>
        </div>
      </div>
      <div class="meta">
        <div><strong>Fecha:</strong> ${hoy}</div>
        <div><strong>Generado por:</strong> ${sessionStorage.getItem('prevrisk_session') ? JSON.parse(sessionStorage.getItem('prevrisk_session')).nombre : 'Sistema'}</div>
        <div><strong>Empresa:</strong> Comercial Lafquen Ltda.</div>
      </div>
    </div>
    ${contenido}
    <div class="footer">Documento generado automáticamente por PrevRisk · ${hoy} · Confidencial</div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}

// Agregar botones PDF en los módulos
function addPDFButtons() {
  const configs = [
    { viewId: 'view-dashboard', label: 'Reporte PDF', modulo: 'dashboard' },
    { viewId: 'view-acc-estadisticas', label: 'Exportar PDF', modulo: 'accidentes' },
    { viewId: 'view-extintores', label: 'Exportar PDF', modulo: 'extintores' },
    { viewId: 'view-epp', label: 'Exportar PDF', modulo: 'epp' },
  ];
  configs.forEach(({ viewId, label, modulo }) => {
    const header = document.querySelector(`#${viewId} .view-actions`);
    if (header && !header.querySelector(`.pdf-btn-${modulo}`)) {
      const btn = document.createElement('button');
      btn.className = `btn-secondary pdf-btn-${modulo}`;
      btn.style.cssText = 'display:flex;align-items:center;gap:.4rem;font-size:.8rem';
      btn.innerHTML = `<span class="material-icons-round" style="font-size:1rem;color:var(--danger)">picture_as_pdf</span> ${label}`;
      btn.addEventListener('click', () => exportarPDF(modulo));
      header.appendChild(btn);
    }
  });
}

// ================================================================
// ===== MEJORA MÓVIL — Service Worker mejorado =====
// ================================================================
function mejorarMovil() {
  // Agregar meta viewport óptimo si no existe
  if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
    const meta = document.createElement('meta');
    meta.name = 'mobile-web-app-capable';
    meta.content = 'yes';
    document.head.appendChild(meta);
  }

  // Swipe para cerrar sidebar en móvil
  let touchStartX = 0;
  document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (dx < -60 && sidebar.classList.contains('open')) sidebar.classList.remove('open');
    if (dx > 60 && touchStartX < 30 && !sidebar.classList.contains('open')) sidebar.classList.add('open');
  }, { passive: true });
}

// ================================================================
// ===== INICIALIZACIÓN GLOBAL V13 =====
// ================================================================
// [bloque notif/pdf/movil movido a init unificado]


// ================================================================
// ===== ESTADO EDITABLE EMBARCACIONES =====
// ================================================================
const EMB_ESTADO_KEY = 'prevrisk_emb_estados';

function loadEmbEstados() {
  try { return JSON.parse(localStorage.getItem(EMB_ESTADO_KEY)) || {}; } catch { return {}; }
}
function saveEmbEstado(viewId, estado) {
  const all = loadEmbEstados();
  all[viewId] = estado;
  localStorage.setItem(EMB_ESTADO_KEY, JSON.stringify(all));
  cloudSave('store/emb_estados', all);
}
function getEmbEstado(viewId) {
  const saved = loadEmbEstados();
  return saved[viewId] || EMBARCACIONES_DATA[viewId]?.estado || 'activa';
}

function updateNavBadgesEmb() {
  ['emb-maria-jose','emb-alvarito','emb-aukan','emb-don-humberto','emb-lafquen'].forEach(id => {
    const estado = getEmbEstado(id);
    const navItem = document.querySelector(`.nav-sub-item[data-view="${id}"]`);
    if (!navItem) return;
    const badge = navItem.querySelector('.nav-badge');
    if (badge) {
      badge.textContent = estado === 'activa' ? 'Activa' : 'Parada';
      badge.className = `nav-badge ${estado === 'activa' ? 'nav-badge-ok' : 'nav-badge-warn'}`;
    }
  });
}

function updateBtnCambioEstado(viewId) {
  const btn = document.getElementById('btnCambioEstadoEmb');
  if (!btn) return;
  const estado = getEmbEstado(viewId);
  btn.innerHTML = estado === 'activa'
    ? `<span class="material-icons-round" style="font-size:1rem;color:var(--warning)">pause_circle</span> Marcar Parada`
    : `<span class="material-icons-round" style="font-size:1rem;color:var(--success)">play_circle</span> Marcar Activa`;
  btn.onclick = () => {
    const nuevo = getEmbEstado(viewId) === 'activa' ? 'parada' : 'activa';
    if (EMBARCACIONES_DATA[viewId]) EMBARCACIONES_DATA[viewId].estado = nuevo;
    saveEmbEstado(viewId, nuevo);
    updateNavBadgesEmb();
    updateBtnCambioEstado(viewId);
    // Actualizar badge en header
    const badge = document.getElementById('embDetailBadge');
    if (badge) {
      badge.textContent = nuevo === 'activa' ? '🟢 Activa' : '🟡 Parada';
      badge.style.cssText = `font-size:.8rem;padding:.3rem .8rem;border-radius:8px;font-weight:700;background:${nuevo==='activa'?'rgba(16,217,160,.15)':'rgba(245,166,35,.15)'};color:${nuevo==='activa'?'var(--success)':'var(--warning)'}`;
    }
    showToast(`Embarcación marcada como ${nuevo === 'activa' ? 'Activa ✅' : 'Parada ⚠️'}`);
    addActivity(`Estado de <strong>${EMBARCACIONES_DATA[viewId]?.nombre}</strong> → <strong>${nuevo}</strong>`);
  };
}

// Hook en el click de embarcaciones para actualizar el botón de estado
document.addEventListener('click', e => {
  const item = e.target.closest('.nav-sub-item[data-view]');
  if (!item) return;
  const viewId = item.dataset.view;
  if (!EMBARCACIONES_DATA?.[viewId]) return;
  // Inyectar estado guardado antes de renderizar
  EMBARCACIONES_DATA[viewId].estado = getEmbEstado(viewId);
  setTimeout(() => updateBtnCambioEstado(viewId), 80);
});

// Inicializar badges al cargar
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(updateNavBadgesEmb, 600);
});


// ================================================================
// ===== EDITAR DATOS DE EMBARCACIÓN =====
// ================================================================
const EMB_CUSTOM_DATA_KEY = 'prevrisk_emb_data';

function loadEmbCustomData() {
  try { return JSON.parse(localStorage.getItem(EMB_CUSTOM_DATA_KEY)) || {}; } catch { return {}; }
}
function saveEmbCustomData(viewId, data) {
  const all = loadEmbCustomData();
  all[viewId] = data;
  localStorage.setItem(EMB_CUSTOM_DATA_KEY, JSON.stringify(all));
  cloudSave('store/emb_data', all);
  // Actualizar EMBARCACIONES_DATA en memoria
  if (EMBARCACIONES_DATA[viewId]) {
    Object.assign(EMBARCACIONES_DATA[viewId], data);
  }
}

function getEmbData(viewId) {
  const custom = loadEmbCustomData();
  // Mezclar datos base con datos editados por el usuario
  return Object.assign({}, EMBARCACIONES_DATA[viewId] || {}, custom[viewId] || {});
}

function openEmbEditModal(viewId) {
  const data = getEmbData(viewId);
  const get = id => { const el = document.getElementById(id); if(el) el.value = data[id.replace('embEdit','').toLowerCase()] || ''; };

  document.getElementById('embEditViewId').value = viewId;

  // Rellenar campos
  document.getElementById('embEditNombre').value = data.nombre || '';
  document.getElementById('embEditMatricula').value = data.matricula || '';
  document.getElementById('embEditTipo').value = data.tipo || 'Embarcación de Trabajo';
  document.getElementById('embEditArmador').value = data.armador || '';
  document.getElementById('embEditEslora').value = data.eslora || '';
  document.getElementById('embEditManga').value = data.manga || '';
  document.getElementById('embEditCalado').value = data.calado || '';
  document.getElementById('embEditMotor').value = data.motor || '';
  document.getElementById('embEditTripulacion').value = data.tripulacion || '';
  document.getElementById('embEditZona').value = data.zona || 'Zona Aysén';
  document.getElementById('embEditPuerto').value = data.puerto || '';
  document.getElementById('embEditPatente').value = data.patente || 'Vigente';
  document.getElementById('embEditAseguradora').value = data.aseguradora || '';
  document.getElementById('embEditVencSeguro').value = data.vencSeguro || '';
  document.getElementById('embEditVencDirectemar').value = data.vencDirectemar || '';
  document.getElementById('embEditObservaciones').value = data.observaciones || '';

  document.getElementById('embEditModalOverlay').classList.add('active');
}

function saveEmbEditForm() {
  const viewId = document.getElementById('embEditViewId').value;
  if (!viewId) return;

  const data = {
    nombre: document.getElementById('embEditNombre').value,
    matricula: document.getElementById('embEditMatricula').value,
    tipo: document.getElementById('embEditTipo').value,
    armador: document.getElementById('embEditArmador').value,
    eslora: document.getElementById('embEditEslora').value,
    manga: document.getElementById('embEditManga').value,
    calado: document.getElementById('embEditCalado').value,
    motor: document.getElementById('embEditMotor').value,
    tripulacion: parseInt(document.getElementById('embEditTripulacion').value) || 0,
    zona: document.getElementById('embEditZona').value,
    puerto: document.getElementById('embEditPuerto').value,
    patente: document.getElementById('embEditPatente').value,
    aseguradora: document.getElementById('embEditAseguradora').value,
    vencSeguro: document.getElementById('embEditVencSeguro').value,
    vencDirectemar: document.getElementById('embEditVencDirectemar').value,
    observaciones: document.getElementById('embEditObservaciones').value,
  };

  saveEmbCustomData(viewId, data);
  document.getElementById('embEditModalOverlay').classList.remove('active');
  showToast('Datos de embarcación guardados ✓');
  addActivity(`Ficha actualizada: <strong>${data.nombre || viewId}</strong>`);

  // Re-renderizar con datos nuevos
  setTimeout(() => renderEmbarcacion(viewId), 50);
}

// Cargar datos personalizados al renderizar
const _origRenderEmb2 = renderEmbarcacion;
renderEmbarcacion = function(viewId) {
  // Inyectar datos guardados por el usuario antes de renderizar
  const customData = loadEmbCustomData();
  if (customData[viewId] && EMBARCACIONES_DATA[viewId]) {
    Object.assign(EMBARCACIONES_DATA[viewId], customData[viewId]);
  }
  _origRenderEmb2(viewId);
};

// Eventos del modal
document.addEventListener('DOMContentLoaded', () => {
  const ov = document.getElementById('embEditModalOverlay');
  if (!ov) return;
  document.getElementById('embEditClose')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('embEditCancel')?.addEventListener('click', () => ov.classList.remove('active'));
  document.getElementById('embEditSave')?.addEventListener('click', saveEmbEditForm);
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); });

  // Conectar botón Editar
  document.getElementById('btnEditarEmb')?.addEventListener('click', () => {
    const viewId = currentDetailKey;
    if (viewId && EMBARCACIONES_DATA[viewId]) openEmbEditModal(viewId);
  });
});


// ================================================================
// ===== MÓDULO 1: INVESTIGACIÓN DE ACCIDENTES =====
// ================================================================

const INV_KEY = 'prevrisk_investigaciones';
let _invMedidas = [];
let _invFilter = 'todas';

function loadInvestigaciones() {
  try { return JSON.parse(localStorage.getItem(INV_KEY)) || []; } catch { return []; }
}
function saveInvestigaciones(data) {
  localStorage.setItem(INV_KEY, JSON.stringify(data));
  cloudSave('store/investigaciones', data);
}

function refreshInvestigacion() {
  const data = loadInvestigaciones();
  const q = (document.getElementById('invSearch')?.value || '').toLowerCase().trim();
  const filter = _invFilter;

  const s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  s('invStatTotal', data.length);
  s('invStatAbiertas', data.filter(d => d.estado === 'abierto').length);
  s('invStatEnProceso', data.filter(d => d.estado === 'en_proceso').length);
  s('invStatCerradas', data.filter(d => d.estado === 'cerrado').length);

  let filtered = data.filter(d => {
    if (filter !== 'todas' && d.estado !== filter) return false;
    if (q) {
      const haystack = `${d.trabajador} ${d.cargo} ${d.causaRaiz} ${d.descripcion} ${d.lugar}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const tbody = document.getElementById('invTableBody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted)">${data.length ? 'Sin resultados para el filtro seleccionado.' : 'No hay investigaciones registradas. Haz clic en "Nueva Investigación" para comenzar.'}</td></tr>`;
    return;
  }

  const ec = {
    abierto:   { bg:'rgba(239,68,68,.12)',  color:'var(--danger)',   label:'Abierto' },
    en_proceso:{ bg:'rgba(56,189,248,.12)', color:'var(--info)',     label:'En Proceso' },
    cerrado:   { bg:'rgba(34,197,94,.12)',  color:'var(--success)',  label:'Cerrado' }
  };

  tbody.innerHTML = filtered.map((inv, idx) => {
    const e = ec[inv.estado] || ec.abierto;
    const medidasPend = (inv.medidas || []).filter(m => m.estado !== 'cerrado').length;
    const medidasTotal = (inv.medidas || []).length;
    return `
      <tr>
        <td style="font-weight:700;color:var(--text-muted);font-size:.8rem">${String(idx+1).padStart(2,'0')}</td>
        <td>
          <div style="font-weight:700;font-size:.84rem">${inv.trabajador || '—'}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${inv.cargo || ''}</div>
        </td>
        <td style="font-size:.82rem">${inv.fechaAccidente ? formatDate(inv.fechaAccidente) : '—'}</td>
        <td><span style="background:rgba(139,92,246,.12);color:var(--accent-light);padding:.2rem .52rem;border-radius:7px;font-size:.69rem;font-weight:700">${inv.tipoDeclaracion || '—'}</span></td>
        <td style="text-align:center;font-weight:700">${inv.diasPerdidos || 0}</td>
        <td><span style="background:${medidasPend>0?'rgba(234,179,8,.12)':'rgba(34,197,94,.12)'};color:${medidasPend>0?'var(--warning)':'var(--success)'};padding:.2rem .52rem;border-radius:7px;font-size:.69rem;font-weight:700">${medidasPend}/${medidasTotal} pend.</span></td>
        <td><span style="background:${e.bg};color:${e.color};padding:.2rem .52rem;border-radius:7px;font-size:.69rem;font-weight:700">${e.label}</span></td>
        <td>
          <div class="table-actions">
            <button onclick="openInvModal('${inv.id}')" title="Editar"><span class="material-icons-round">edit</span></button>
            <button onclick="abrirInvDetalle('${inv.id}')" title="Ver informe"><span class="material-icons-round">account_tree</span></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function setInvFilter(filter) {
  _invFilter = filter;
  document.querySelectorAll('#invFilterGroup .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  refreshInvestigacion();
}

function openInvModal(id = null) {
  _invMedidas = [];
  const overlay = document.getElementById('invModalOverlay');
  if (!overlay) return;
  const delBtn = document.getElementById('invBtnDelete');

  if (id) {
    const inv = loadInvestigaciones().find(i => i.id === id);
    if (!inv) return;
    const fields = ['trabajador','cargo','embarcacion','fechaAccidente','lugar','tipoDeclaracion',
      'diasPerdidos','fechaInvestigacion','descripcion','parteAfectada','tipoLesion',
      'causaInmediata','causaBasica','causaRaiz','estado','investigador','observaciones'];
    fields.forEach(f => {
      const el = document.getElementById('inv' + f.charAt(0).toUpperCase() + f.slice(1));
      if (el) el.value = inv[f] !== undefined ? inv[f] : '';
    });
    document.getElementById('invId').value = inv.id;
    _invMedidas = (inv.medidas || []).map(m => ({ ...m }));
    if (delBtn) delBtn.style.display = 'block';
    document.getElementById('invModalTitle').textContent = 'Editar Investigación';
  } else {
    ['invId','invTrabajador','invLugar','invDescripcion','invParteAfectada','invTipoLesion',
     'invCausaInmediata','invCausaBasica','invCausaRaiz','invObservaciones'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const fecInv = document.getElementById('invFechaInvestigacion');
    if (fecInv) fecInv.value = new Date().toISOString().split('T')[0];
    const dias = document.getElementById('invDiasPerdidos'); if (dias) dias.value = '0';
    const inv = document.getElementById('invInvestigador'); if (inv) inv.value = 'Bastian Ancapán Vera';
    const est = document.getElementById('invEstado'); if (est) est.value = 'abierto';
    const tip = document.getElementById('invTipoDeclaracion'); if (tip) tip.value = 'DIAT';
    if (delBtn) delBtn.style.display = 'none';
    document.getElementById('invModalTitle').textContent = 'Nueva Investigación de Accidente';
  }

  renderInvMedidas();
  overlay.classList.add('active');
}

function closeInvModal() {
  const overlay = document.getElementById('invModalOverlay');
  if (overlay) overlay.classList.remove('active');
  _invMedidas = [];
}

function renderInvMedidas() {
  const container = document.getElementById('invMedidasContainer');
  if (!container) return;
  if (!_invMedidas.length) {
    container.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Sin medidas correctivas. Haz clic en "Agregar Medida".</div>`;
    return;
  }
  container.innerHTML = _invMedidas.map((m, i) => `
    <div style="display:grid;grid-template-columns:1fr 110px 130px 108px 30px;gap:.4rem;align-items:center;background:var(--bg-hover);border-radius:var(--radius-sm);padding:.55rem .7rem;border:1px solid var(--border)">
      <input type="text" value="${(m.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Descripción de la medida..."
        style="font-size:.81rem;border:none;background:transparent;color:var(--text);padding:0;min-width:0"
        oninput="_invMedidas[${i}].descripcion=this.value">
      <input type="text" value="${(m.responsable||'').replace(/"/g,'&quot;')}" placeholder="Responsable"
        style="font-size:.78rem;border:none;background:transparent;color:var(--text);padding:0;text-align:center;min-width:0"
        oninput="_invMedidas[${i}].responsable=this.value">
      <input type="date" value="${m.plazo||''}"
        style="font-size:.78rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px;min-width:0"
        onchange="_invMedidas[${i}].plazo=this.value">
      <select style="font-size:.76rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px;min-width:0"
        onchange="_invMedidas[${i}].estado=this.value">
        <option value="pendiente" ${m.estado==='pendiente'?'selected':''}>Pendiente</option>
        <option value="en_proceso" ${m.estado==='en_proceso'?'selected':''}>En Proceso</option>
        <option value="cerrado" ${m.estado==='cerrado'?'selected':''}>Cerrada</option>
      </select>
      <button onclick="invEliminarMedida(${i})" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center;flex-shrink:0">
        <span class="material-icons-round" style="font-size:.82rem">close</span>
      </button>
    </div>`).join('');
}

function invAgregarMedida() {
  _invMedidas.push({ id: genId(), descripcion: '', responsable: '', plazo: '', estado: 'pendiente' });
  renderInvMedidas();
}

function invEliminarMedida(idx) {
  _invMedidas.splice(idx, 1);
  renderInvMedidas();
}

function saveInvestigacion() {
  const trabajador = document.getElementById('invTrabajador')?.value.trim();
  if (!trabajador) { showToast('Ingresa el nombre del trabajador accidentado', 'error'); return; }
  const id = document.getElementById('invId')?.value;
  const data = loadInvestigaciones();
  const isEdit = !!id;

  const inv = {
    id: id || genId(),
    trabajador,
    cargo: document.getElementById('invCargo')?.value || '',
    embarcacion: document.getElementById('invEmbarcacion')?.value || '',
    fechaAccidente: document.getElementById('invFechaAccidente')?.value || '',
    lugar: document.getElementById('invLugar')?.value || '',
    tipoDeclaracion: document.getElementById('invTipoDeclaracion')?.value || 'DIAT',
    diasPerdidos: parseInt(document.getElementById('invDiasPerdidos')?.value) || 0,
    fechaInvestigacion: document.getElementById('invFechaInvestigacion')?.value || '',
    descripcion: document.getElementById('invDescripcion')?.value || '',
    parteAfectada: document.getElementById('invParteAfectada')?.value || '',
    tipoLesion: document.getElementById('invTipoLesion')?.value || '',
    causaInmediata: document.getElementById('invCausaInmediata')?.value || '',
    causaBasica: document.getElementById('invCausaBasica')?.value || '',
    causaRaiz: document.getElementById('invCausaRaiz')?.value || '',
    medidas: _invMedidas,
    estado: document.getElementById('invEstado')?.value || 'abierto',
    investigador: document.getElementById('invInvestigador')?.value || 'Bastian Ancapán Vera',
    observaciones: document.getElementById('invObservaciones')?.value || '',
    createdAt: isEdit ? (data.find(i=>i.id===id)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isEdit) {
    const idx = data.findIndex(i => i.id === id);
    if (idx !== -1) data[idx] = inv; else data.push(inv);
  } else {
    data.push(inv);
  }

  saveInvestigaciones(data);
  addActivity(`Investigación ${isEdit?'actualizada':'registrada'}: <strong>${inv.trabajador}</strong> — ${inv.tipoDeclaracion}`);
  showToast(`Investigación ${isEdit?'actualizada':'guardada'} correctamente ✓`);
  closeInvModal();
  refreshInvestigacion();
}

function deleteInvestigacion() {
  const id = document.getElementById('invId')?.value;
  if (!id || !confirm('¿Eliminar esta investigación? Esta acción no se puede deshacer.')) return;
  saveInvestigaciones(loadInvestigaciones().filter(i => i.id !== id));
  showToast('Investigación eliminada', 'error');
  closeInvModal();
  refreshInvestigacion();
}

function abrirInvDetalle(id) {
  const inv = loadInvestigaciones().find(i => i.id === id);
  if (!inv) return;
  const hoy = new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
  const ecL = {abierto:'ABIERTO',en_proceso:'EN PROCESO',cerrado:'CERRADO'};
  const ecC = {abierto:'#ef4444',en_proceso:'#38bdf8',cerrado:'#22c55e'};
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Investigación — ${inv.trabajador}</title>
  <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:2rem;color:#1a1d27;background:#fff}h1{font-size:1.3rem;font-weight:800;margin:0}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #8b5cf6;padding-bottom:1rem;margin-bottom:1.5rem}.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem}.logo{display:flex;align-items:center;gap:.6rem}.meta{text-align:right;font-size:.75rem;color:#666}.sec{margin-bottom:1.2rem}.sec-t{font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.7px;color:#666;border-bottom:1px solid #eee;padding-bottom:.3rem;margin-bottom:.65rem}.g2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.fl{margin-bottom:.5rem}.fl-l{font-size:.7rem;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.4px}.fl-v{font-size:.87rem;font-weight:600;margin-top:.1rem}.cb{border-radius:8px;padding:.85rem 1rem;margin-bottom:.7rem}.ci{background:#fef2f2;border-left:4px solid #ef4444}.cb2{background:#fffbeb;border-left:4px solid #eab308}.cr{background:#f5f3ff;border-left:4px solid #8b5cf6}.cl{font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.3rem}.ci .cl{color:#ef4444}.cb2 .cl{color:#d97706}.cr .cl{color:#7c3aed}.ct{font-size:.85rem;line-height:1.55}table{width:100%;border-collapse:collapse;font-size:.81rem}th{text-align:left;padding:.55rem .75rem;background:#f5f3ff;color:#555;font-size:.69rem;text-transform:uppercase;border-bottom:2px solid #ddd}td{padding:.5rem .75rem;border-bottom:1px solid #eee}.bdg{padding:.2rem .55rem;border-radius:6px;font-size:.68rem;font-weight:700}.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #ddd;text-align:center;font-size:.7rem;color:#888}@media print{body{padding:1rem}}</style></head><body>
  <div class="header"><div class="logo"><div class="logo-icon">PR</div><div><h1>Investigación de Accidente</h1><div style="font-size:.75rem;color:#666;margin-top:.15rem">PrevRisk — Comercial Lafquen Ltda.</div></div></div><div class="meta"><div><strong>Folio:</strong> INV-${inv.id.slice(-6).toUpperCase()}</div><div><strong>Estado:</strong> <span style="color:${ecC[inv.estado]||'#888'};font-weight:800">${ecL[inv.estado]||inv.estado}</span></div><div><strong>Fecha:</strong> ${hoy}</div></div></div>
  <div class="sec"><div class="sec-t">Datos del Evento</div><div class="g2"><div><div class="fl"><div class="fl-l">Trabajador</div><div class="fl-v">${inv.trabajador||'—'}</div></div><div class="fl"><div class="fl-l">Cargo</div><div class="fl-v">${inv.cargo||'—'}</div></div></div><div><div class="fl"><div class="fl-l">Embarcación</div><div class="fl-v">${inv.embarcacion||'—'}</div></div><div class="fl"><div class="fl-l">Fecha Accidente</div><div class="fl-v">${inv.fechaAccidente?formatDate(inv.fechaAccidente):'—'}</div></div></div></div><div class="g2"><div class="fl"><div class="fl-l">Lugar</div><div class="fl-v">${inv.lugar||'—'}</div></div><div class="fl"><div class="fl-l">Declaración / Días Perdidos</div><div class="fl-v">${inv.tipoDeclaracion||'—'} · ${inv.diasPerdidos||0} días</div></div></div></div>
  <div class="sec"><div class="sec-t">Descripción del Accidente</div><p style="font-size:.86rem;line-height:1.6;margin:0">${inv.descripcion||'Sin descripción registrada.'}</p>${inv.parteAfectada||inv.tipoLesion?`<div class="g2" style="margin-top:.75rem"><div class="fl"><div class="fl-l">Parte Afectada</div><div class="fl-v">${inv.parteAfectada||'—'}</div></div><div class="fl"><div class="fl-l">Tipo de Lesión</div><div class="fl-v">${inv.tipoLesion||'—'}</div></div></div>`:''}</div>
  <div class="sec"><div class="sec-t">Árbol de Causas</div><div class="cb ci"><div class="cl">Causa Inmediata — Acto / Condición Insegura</div><div class="ct">${inv.causaInmediata||'No registrada.'}</div></div><div class="cb cb2"><div class="cl">Causa Básica — Factores Personales / de Trabajo</div><div class="ct">${inv.causaBasica||'No registrada.'}</div></div><div class="cb cr"><div class="cl">Causa Raíz — Falla en el Sistema de Gestión</div><div class="ct">${inv.causaRaiz||'No registrada.'}</div></div></div>
  ${inv.medidas&&inv.medidas.length?`<div class="sec"><div class="sec-t">Medidas Correctivas</div><table><thead><tr><th>#</th><th>Descripción</th><th>Responsable</th><th>Plazo</th><th>Estado</th></tr></thead><tbody>${inv.medidas.map((m,i)=>{const s={pendiente:{bg:'#fef9c3',c:'#854d0e'},en_proceso:{bg:'#e0f2fe',c:'#0369a1'},cerrado:{bg:'#dcfce7',c:'#166534'}}[m.estado]||{bg:'#fef9c3',c:'#854d0e'};return`<tr style="background:${i%2?'#fff':'#f9fafc'}"><td style="font-weight:700;color:#999">${i+1}</td><td>${m.descripcion||'—'}</td><td>${m.responsable||'—'}</td><td>${m.plazo?formatDate(m.plazo):'—'}</td><td><span class="bdg" style="background:${s.bg};color:${s.c}">${(m.estado||'').replace('_',' ').toUpperCase()}</span></td></tr>`;}).join('')}</tbody></table></div>`:''}
  <div style="display:flex;justify-content:space-around;margin-top:2.5rem;padding-top:1.5rem;border-top:1px dashed #ddd"><div style="text-align:center"><div style="border-top:1px solid #000;padding-top:.4rem;width:200px;margin:0 auto;font-size:.8rem;color:#555">${inv.investigador||'Bastian Ancapán Vera'}<br><small>Prevencionista de Riesgos</small></div></div><div style="text-align:center"><div style="border-top:1px solid #000;padding-top:.4rem;width:200px;margin:0 auto;font-size:.8rem;color:#555">${inv.trabajador||''}<br><small>Trabajador Accidentado</small></div></div></div>
  <div class="footer">Documento generado automáticamente por PrevRisk · ${hoy} · Confidencial — Comercial Lafquen Ltda.</div>
  </body></html>`;
  const win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); setTimeout(()=>win.print(),500); }
}

// Exportar PDF lista completa
const _origExportarPDF_inv = exportarPDF;
exportarPDF = function(modulo) {
  if (modulo !== 'investigacion') return _origExportarPDF_inv.apply(this, arguments);
  const hoy = new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
  const data = loadInvestigaciones();
  const ecC = {abierto:'#ef4444',en_proceso:'#38bdf8',cerrado:'#22c55e'};
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Registro Investigaciones</title>
  <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:2rem;color:#1a1d27;background:#fff}h1{font-size:1.3rem;font-weight:800;margin:0}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #8b5cf6;padding-bottom:1rem;margin-bottom:1.5rem}.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem}.logo{display:flex;align-items:center;gap:.6rem}.meta{text-align:right;font-size:.75rem;color:#666}table{width:100%;border-collapse:collapse;font-size:.8rem}th{text-align:left;padding:.55rem .75rem;background:#f5f3ff;color:#555;font-size:.69rem;text-transform:uppercase;border-bottom:2px solid #ddd}td{padding:.5rem .75rem;border-bottom:1px solid #eee}.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #ddd;text-align:center;font-size:.7rem;color:#888}@media print{body{padding:1rem}}</style>
  </head><body>
  <div class="header"><div class="logo"><div class="logo-icon">PR</div><div><h1>Registro de Investigaciones de Accidentes</h1><div style="font-size:.75rem;color:#666;margin-top:.15rem">PrevRisk — Comercial Lafquen Ltda.</div></div></div><div class="meta"><div><strong>Fecha:</strong> ${hoy}</div><div><strong>Total:</strong> ${data.length} registros</div></div></div>
  ${data.length===0?'<p style="text-align:center;color:#888;padding:2rem">Sin investigaciones registradas.</p>':`<table><thead><tr><th>#</th><th>Trabajador</th><th>Cargo</th><th>Embarcación</th><th>Fecha Acc.</th><th>Declaración</th><th>Días</th><th>Medidas Pend.</th><th>Estado</th></tr></thead><tbody>${data.map((inv,i)=>{const pend=(inv.medidas||[]).filter(m=>m.estado!=='cerrado').length;return`<tr style="background:${i%2?'#fff':'#f9fafc'}"><td style="font-weight:700;color:#999">${i+1}</td><td><strong>${inv.trabajador||'—'}</strong></td><td>${inv.cargo||'—'}</td><td>${inv.embarcacion||'—'}</td><td>${inv.fechaAccidente?formatDate(inv.fechaAccidente):'—'}</td><td>${inv.tipoDeclaracion||'—'}</td><td style="text-align:center">${inv.diasPerdidos||0}</td><td style="text-align:center">${pend}</td><td><span style="color:${ecC[inv.estado]||'#888'};font-weight:700;text-transform:uppercase;font-size:.75rem">${(inv.estado||'').replace('_',' ')}</span></td></tr>`;}).join('')}</tbody></table>`}
  <div class="footer">Generado por PrevRisk · ${hoy} · Confidencial</div>
  </body></html>`;
  const win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); setTimeout(()=>win.print(),500); }
};

// Integración alertas campanita
const _origRenderNotif_inv = renderNotifList;
renderNotifList = function() {
  _origRenderNotif_inv.apply(this, arguments);
  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  if (!list) return;
  const todayStr = new Date().toISOString().split('T')[0];
  const venc = [];
  loadInvestigaciones().forEach(inv => {
    if (inv.estado === 'cerrado') return;
    (inv.medidas||[]).forEach(m => {
      if (m.estado !== 'cerrado' && m.plazo && m.plazo < todayStr) venc.push({ inv: inv.trabajador, desc: m.descripcion });
    });
  });
  if (!venc.length) return;
  const entry = document.createElement('div');
  entry.style.cssText = 'padding:.8rem 1.2rem;border-bottom:1px solid var(--border);display:flex;gap:.75rem;align-items:flex-start;';
  entry.innerHTML = `<span class="material-icons-round" style="color:var(--danger);font-size:1.2rem;flex-shrink:0;">policy</span><div><div style="font-size:.82rem;font-weight:700;">${venc.length} medida(s) correctiva(s) vencidas</div><div style="font-size:.72rem;color:var(--text-secondary);margin-top:.1rem;">${venc.slice(0,2).map(v=>`${v.inv}: ${(v.desc||'').slice(0,35)}`).join(' | ')}</div></div>`;
  list.insertBefore(entry, list.firstChild);
  if (badge) badge.style.display = 'block';
};

// Cierre modal al click fuera
document.addEventListener('DOMContentLoaded', () => {
  const ov = document.getElementById('invModalOverlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeInvModal(); });
});

// ================================================================
// ===== MÓDULO 2: VIGILANCIA SALUD OCUPACIONAL =====
// ================================================================
const SALUD_KEY = 'prevrisk_salud_ocup';
let _saludEnfs = [], _saludHistorial = [], _saludFilter = 'todos';
function loadSaludOcup(){ try{return JSON.parse(localStorage.getItem(SALUD_KEY))||[];}catch{return [];} }
function saveSaludOcup2(d){ localStorage.setItem(SALUD_KEY,JSON.stringify(d)); cloudSave('store/salud_ocup',d); }

function refreshSaludOcup(){
  const data=loadSaludOcup(), today=new Date(), todayStr=today.toISOString().split('T')[0];
  const in30=new Date(today); in30.setDate(in30.getDate()+30); const in30s=in30.toISOString().split('T')[0];
  const q=(document.getElementById('saludSearch')?.value||'').toLowerCase();
  const f=_saludFilter;
  const buzos=data.filter(d=>['Buzo Básico','Supervisor de Buceo'].includes(d.cargo));
  const porVencer=data.filter(d=>d.proxExamen&&d.proxExamen>=todayStr&&d.proxExamen<=in30s);
  const vencidos=data.filter(d=>d.proxExamen&&d.proxExamen<todayStr);
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('saludStatTotal',data.length); s('saludStatBuzos',buzos.length);
  s('saludStatPorVencer',porVencer.length); s('saludStatVencidos',vencidos.length);
  let filtered=data.filter(d=>{
    if(f==='buzos'&&!['Buzo Básico','Supervisor de Buceo'].includes(d.cargo))return false;
    if(f==='alertas'&&!(d.proxExamen&&d.proxExamen<=in30s))return false;
    if(q&&!`${d.nombre} ${d.cargo} ${d.embarcacion}`.toLowerCase().includes(q))return false;
    return true;
  });
  const tbody=document.getElementById('saludTableBody'); if(!tbody)return;
  if(!filtered.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:2.5rem;color:var(--text-muted)">Sin resultados.</td></tr>`;return;}
  const aptColors={apto:'var(--success)',apto_restricciones:'var(--warning)',no_apto:'var(--danger)',pendiente:'var(--text-muted)'};
  const aptLabels={apto:'Apto',apto_restricciones:'Apto c/Rest.',no_apto:'No Apto',pendiente:'Pendiente'};
  tbody.innerHTML=filtered.map(d=>{
    const exVenc=d.proxExamen&&d.proxExamen<todayStr, exProx=d.proxExamen&&d.proxExamen<=in30s&&!exVenc;
    const estadoHTML=exVenc?`<span class="doc-status doc-vencido">Vencido</span>`:exProx?`<span class="doc-status doc-por-vencer">Por Vencer</span>`:`<span class="doc-status doc-vigente">Vigente</span>`;
    const hiperHTML=d.hiperUltimo?`<span style="font-size:.72rem;color:var(--success)">✓ ${formatDate(d.hiperUltimo)}</span>`:`<span style="font-size:.72rem;color:var(--text-muted)">—</span>`;
    const enfCount=(d.enfermedades||[]).length;
    return`<tr><td><div style="font-weight:700;font-size:.84rem">${d.nombre||'—'}</div><div style="font-size:.72rem;color:var(--text-muted)">${d.rut||''}</div></td><td style="font-size:.82rem">${d.cargo||'—'}</td><td style="font-size:.82rem">${d.embarcacion||'—'}</td><td style="font-size:.82rem">${d.ultimoExamen?formatDate(d.ultimoExamen):'—'}</td><td style="font-size:.82rem">${d.proxExamen?formatDate(d.proxExamen):'—'}</td><td>${hiperHTML}</td><td style="text-align:center"><span style="background:${enfCount>0?'rgba(239,68,68,.12)':'var(--bg-hover)'};color:${enfCount>0?'var(--danger)':'var(--text-muted)'};padding:.15rem .45rem;border-radius:6px;font-size:.72rem;font-weight:700">${enfCount}</span></td><td>${estadoHTML}</td><td><div class="table-actions"><button onclick="openSaludModal('${d.id}')" title="Editar"><span class="material-icons-round">edit</span></button></div></td></tr>`;
  }).join('');
}
function setSaludFilter(f){_saludFilter=f;document.querySelectorAll('#saludFilterGroup .filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));refreshSaludOcup();}
function openSaludModal(id=null){
  _saludEnfs=[]; _saludHistorial=[];
  const ov=document.getElementById('saludModalOverlay'); if(!ov)return;
  if(id){
    const d=loadSaludOcup().find(i=>i.id===id); if(!d)return;
    ['nombre','rut','cargo','embarcacion','ultimoExamen','proxExamen','centro','aptitud','restricciones','hiperUltimo','hiperProx','hiperObs'].forEach(f=>{const e=document.getElementById('salud'+f.charAt(0).toUpperCase()+f.slice(1));if(e)e.value=d[f]||'';});
    document.getElementById('saludId').value=id;
    _saludEnfs=(d.enfermedades||[]).map(e=>({...e}));
    _saludHistorial=(d.historial||[]).map(h=>({...h}));
    document.getElementById('saludBtnDelete').style.display='block';
    document.getElementById('saludModalTitle').textContent='Editar Registro Salud';
  }else{
    ['saludId','saludNombre','saludRut','saludRestricciones','saludHiperObs'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    ['saludUltimoExamen','saludProxExamen','saludHiperUltimo','saludHiperProx'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    const ap=document.getElementById('saludAptitud');if(ap)ap.value='apto';
    document.getElementById('saludBtnDelete').style.display='none';
    document.getElementById('saludModalTitle').textContent='Registro Salud Ocupacional';
  }
  renderSaludEnfs(); renderSaludHistorial(); ov.classList.add('active');
}
function closeSaludModal(){const ov=document.getElementById('saludModalOverlay');if(ov)ov.classList.remove('active');}
function renderSaludEnfs(){
  const c=document.getElementById('saludEnfContainer');if(!c)return;
  if(!_saludEnfs.length){c.innerHTML=`<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Sin enfermedades profesionales registradas.</div>`;return;}
  c.innerHTML=_saludEnfs.map((e,i)=>`<div style="display:grid;grid-template-columns:1fr 130px 130px 30px;gap:.4rem;align-items:center;background:var(--bg-hover);border-radius:var(--radius-sm);padding:.5rem .7rem;border:1px solid var(--border);margin-bottom:.4rem"><input type="text" value="${(e.tipo||'').replace(/"/g,'&quot;')}" placeholder="Tipo enfermedad..." style="font-size:.8rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_saludEnfs[${i}].tipo=this.value"><input type="date" value="${e.fecha||''}" style="font-size:.78rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px" onchange="_saludEnfs[${i}].fecha=this.value"><select style="font-size:.76rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px" onchange="_saludEnfs[${i}].estado=this.value"><option value="evaluacion" ${e.estado==='evaluacion'?'selected':''}>En Evaluación</option><option value="reconocida" ${e.estado==='reconocida'?'selected':''}>Reconocida</option><option value="rechazada" ${e.estado==='rechazada'?'selected':''}>Rechazada</option></select><button onclick="_saludEnfs.splice(${i},1);renderSaludEnfs()" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center"><span class="material-icons-round" style="font-size:.82rem">close</span></button></div>`).join('');
}
function saludAgregarEnfermedad(){_saludEnfs.push({id:genId(),tipo:'',fecha:'',estado:'evaluacion'});renderSaludEnfs();}
function renderSaludHistorial(){
  const c=document.getElementById('saludHistorialContainer');if(!c)return;
  if(!_saludHistorial.length){c.innerHTML=`<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Sin entradas en el historial.</div>`;return;}
  c.innerHTML=_saludHistorial.map((h,i)=>`<div style="display:grid;grid-template-columns:130px 1fr 30px;gap:.4rem;align-items:center;background:var(--bg-hover);border-radius:var(--radius-sm);padding:.5rem .7rem;border:1px solid var(--border);margin-bottom:.4rem"><input type="date" value="${h.fecha||''}" style="font-size:.78rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px" onchange="_saludHistorial[${i}].fecha=this.value"><input type="text" value="${(h.nota||'').replace(/"/g,'&quot;')}" placeholder="Nota / evento médico laboral..." style="font-size:.8rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_saludHistorial[${i}].nota=this.value"><button onclick="_saludHistorial.splice(${i},1);renderSaludHistorial()" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center"><span class="material-icons-round" style="font-size:.82rem">close</span></button></div>`).join('');
}
function saludAgregarHistorial(){_saludHistorial.push({fecha:'',nota:''});renderSaludHistorial();}
function saveSaludOcup(){
  const nombre=document.getElementById('saludNombre')?.value.trim();
  if(!nombre){showToast('Ingresa el nombre del trabajador','error');return;}
  const id=document.getElementById('saludId')?.value;
  const data=loadSaludOcup(); const isEdit=!!id;
  const rec={id:id||genId(),nombre,rut:document.getElementById('saludRut')?.value||'',cargo:document.getElementById('saludCargo')?.value||'',embarcacion:document.getElementById('saludEmbarcacion')?.value||'',ultimoExamen:document.getElementById('saludUltimoExamen')?.value||'',proxExamen:document.getElementById('saludProxExamen')?.value||'',centro:document.getElementById('saludCentro')?.value||'',aptitud:document.getElementById('saludAptitud')?.value||'apto',restricciones:document.getElementById('saludRestricciones')?.value||'',hiperUltimo:document.getElementById('saludHiperUltimo')?.value||'',hiperProx:document.getElementById('saludHiperProx')?.value||'',hiperObs:document.getElementById('saludHiperObs')?.value||'',enfermedades:_saludEnfs,historial:_saludHistorial,updatedAt:new Date().toISOString()};
  if(isEdit){const idx=data.findIndex(i=>i.id===id);if(idx!==-1)data[idx]=rec;else data.push(rec);}else data.push(rec);
  saveSaludOcup2(data); addActivity(`Salud Ocupacional: <strong>${nombre}</strong>`);
  showToast('Registro guardado ✓'); closeSaludModal(); refreshSaludOcup();
}
function deleteSaludOcup(){
  const id=document.getElementById('saludId')?.value;
  if(!id||!confirm('¿Eliminar este registro?'))return;
  saveSaludOcup2(loadSaludOcup().filter(i=>i.id!==id));
  showToast('Eliminado','error'); closeSaludModal(); refreshSaludOcup();
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('saludModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closeSaludModal();});});

// ================================================================
// ===== MÓDULO 3: PTS — PROCEDIMIENTOS DE TRABAJO SEGURO =====
// ================================================================
const PTS_KEY='prevrisk_pts';
let _ptsPasos=[], _ptsFirmas=[];
function loadPTS(){try{return JSON.parse(localStorage.getItem(PTS_KEY))||[];}catch{return[];}}
function savePTSData(d){localStorage.setItem(PTS_KEY,JSON.stringify(d));cloudSave('store/pts',d);}
function refreshPTS(){
  const data=loadPTS();
  const totalFirmas=data.reduce((s,p)=>s+(p.firmas||[]).length,0);
  const personal=loadPersonal();
  const ahora=new Date(); ahora.setMonth(ahora.getMonth()-3); const hace3m=ahora.toISOString().split('T')[0];
  const sinFirma=personal.filter(p=>{const uf=data.reduce((lat,pts)=>{const f=(pts.firmas||[]).filter(fi=>fi.nombre===p.nombre);return f.length?Math.max(lat,...f.map(fi=>fi.fecha)):lat;},'');return !uf||uf<hace3m;}).length;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('ptsStatTotal',data.length); s('ptsStatFirmas',totalFirmas); s('ptsStatSinFirma',sinFirma);
  const tbody=document.getElementById('ptsTableBody'); if(!tbody)return;
  if(!data.length){tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:2.5rem;color:var(--text-muted)">Sin PTS registrados. Haz clic en "Nuevo PTS".</td></tr>`;return;}
  tbody.innerHTML=data.map(p=>`<tr><td><div style="font-weight:700;font-size:.84rem">${p.nombre||'—'}</div><div style="font-size:.72rem;color:var(--text-muted)">v${p.version||'1.0'}</div></td><td style="font-size:.82rem">${p.actividad||'—'}</td><td style="font-size:.79rem;color:var(--text-secondary)">${(p.epp||'').slice(0,60)||'—'}</td><td style="font-size:.82rem">${p.fecha?formatDate(p.fecha):'—'}</td><td><span style="background:rgba(34,197,94,.12);color:var(--success);padding:.15rem .45rem;border-radius:6px;font-size:.72rem;font-weight:700">${(p.firmas||[]).length} firmas</span></td><td><div class="table-actions"><button onclick="openPTSModal('${p.id}')" title="Editar"><span class="material-icons-round">edit</span></button><button onclick="imprimirPTS('${p.id}')" title="Imprimir"><span class="material-icons-round">print</span></button></div></td></tr>`).join('');
}
function openPTSModal(id=null){
  _ptsPasos=[]; _ptsFirmas=[];
  const ov=document.getElementById('ptsModalOverlay'); if(!ov)return;
  if(id){
    const p=loadPTS().find(i=>i.id===id); if(!p)return;
    ['nombre','actividad','version','epp','objetivo','alcance','riesgos','medidas'].forEach(f=>{const e=document.getElementById('pts'+f.charAt(0).toUpperCase()+f.slice(1));if(e)e.value=p[f]||'';});
    document.getElementById('ptsFecha').value=p.fecha||'';
    document.getElementById('ptsId').value=id;
    _ptsPasos=(p.pasos||[]).map(x=>({...x}));
    _ptsFirmas=(p.firmas||[]).map(x=>({...x}));
    document.getElementById('ptsBtnDelete').style.display='block';
    document.getElementById('ptsModalTitle').textContent='Editar PTS';
  }else{
    ['ptsId','ptsNombre','ptsActividad','ptsEPP','ptsObjetivo','ptsAlcance','ptsRiesgos','ptsMedidas'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('ptsFecha').value=new Date().toISOString().split('T')[0];
    document.getElementById('ptsVersion').value='v1.0';
    document.getElementById('ptsBtnDelete').style.display='none';
    document.getElementById('ptsModalTitle').textContent='Nuevo PTS';
  }
  renderPtsPasos(); renderPtsFirmas(); ov.classList.add('active');
}
function closePTSModal(){const ov=document.getElementById('ptsModalOverlay');if(ov)ov.classList.remove('active');}
function renderPtsPasos(){
  const c=document.getElementById('ptsPasosContainer');if(!c)return;
  if(!_ptsPasos.length){c.innerHTML=`<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Agrega los pasos del procedimiento.</div>`;return;}
  c.innerHTML=_ptsPasos.map((p,i)=>`<div style="display:grid;grid-template-columns:28px 1fr 30px;gap:.4rem;align-items:center;background:var(--bg-hover);border-radius:var(--radius-sm);padding:.5rem .7rem;border:1px solid var(--border);margin-bottom:.35rem"><span style="font-weight:900;color:var(--accent);font-size:.8rem;text-align:center">${i+1}</span><input type="text" value="${(p.desc||'').replace(/"/g,'&quot;')}" placeholder="Descripción del paso..." style="font-size:.81rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_ptsPasos[${i}].desc=this.value"><button onclick="_ptsPasos.splice(${i},1);renderPtsPasos()" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center"><span class="material-icons-round" style="font-size:.82rem">close</span></button></div>`).join('');
}
function ptsAgregarPaso(){_ptsPasos.push({desc:''});renderPtsPasos();}
function renderPtsFirmas(){
  const c=document.getElementById('ptsFirmasContainer');if(!c)return;
  if(!_ptsFirmas.length){c.innerHTML=`<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Sin firmas registradas.</div>`;return;}
  c.innerHTML=_ptsFirmas.map((f,i)=>`<div style="display:grid;grid-template-columns:1fr 100px 100px 130px 30px;gap:.4rem;align-items:center;background:var(--bg-hover);border-radius:var(--radius-sm);padding:.5rem .7rem;border:1px solid var(--border);margin-bottom:.35rem"><input type="text" value="${(f.nombre||'').replace(/"/g,'&quot;')}" placeholder="Nombre trabajador" style="font-size:.8rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_ptsFirmas[${i}].nombre=this.value"><input type="text" value="${(f.rut||'').replace(/"/g,'&quot;')}" placeholder="RUT" style="font-size:.78rem;border:none;background:transparent;color:var(--text);padding:0;text-align:center" oninput="_ptsFirmas[${i}].rut=this.value"><input type="text" value="${(f.cargo||'').replace(/"/g,'&quot;')}" placeholder="Cargo" style="font-size:.78rem;border:none;background:transparent;color:var(--text);padding:0;text-align:center" oninput="_ptsFirmas[${i}].cargo=this.value"><input type="date" value="${f.fecha||''}" style="font-size:.78rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px" onchange="_ptsFirmas[${i}].fecha=this.value"><button onclick="_ptsFirmas.splice(${i},1);renderPtsFirmas()" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center"><span class="material-icons-round" style="font-size:.82rem">close</span></button></div>`).join('');
}
function ptsAgregarFirma(){_ptsFirmas.push({nombre:'',rut:'',cargo:'',fecha:new Date().toISOString().split('T')[0]});renderPtsFirmas();}
function savePTS(){
  const nombre=document.getElementById('ptsNombre')?.value.trim();
  if(!nombre){showToast('Ingresa el nombre del PTS','error');return;}
  const id=document.getElementById('ptsId')?.value; const data=loadPTS(); const isEdit=!!id;
  const rec={id:id||genId(),nombre,actividad:document.getElementById('ptsActividad')?.value||'',version:document.getElementById('ptsVersion')?.value||'v1.0',fecha:document.getElementById('ptsFecha')?.value||'',objetivo:document.getElementById('ptsObjetivo')?.value||'',alcance:document.getElementById('ptsAlcance')?.value||'',epp:document.getElementById('ptsEPP')?.value||'',riesgos:document.getElementById('ptsRiesgos')?.value||'',medidas:document.getElementById('ptsMedidas')?.value||'',pasos:_ptsPasos,firmas:_ptsFirmas,updatedAt:new Date().toISOString()};
  if(isEdit){const idx=data.findIndex(i=>i.id===id);if(idx!==-1)data[idx]=rec;else data.push(rec);}else data.push(rec);
  savePTSData(data); addActivity(`PTS ${isEdit?'actualizado':'registrado'}: <strong>${nombre}</strong>`);
  showToast(`PTS ${isEdit?'actualizado':'guardado'} ✓`); closePTSModal(); refreshPTS();
}
function deletePTS(){
  const id=document.getElementById('ptsId')?.value;
  if(!id||!confirm('¿Eliminar este PTS?'))return;
  savePTSData(loadPTS().filter(i=>i.id!==id));
  showToast('PTS eliminado','error'); closePTSModal(); refreshPTS();
}
function imprimirPTS(id){
  const p=loadPTS().find(i=>i.id===id); if(!p)return;
  const hoy=new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>PTS — ${p.nombre}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:2rem;color:#1a1d27;background:#fff}h1{font-size:1.3rem;font-weight:800;margin:0}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #8b5cf6;padding-bottom:1rem;margin-bottom:1.5rem}.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem}.logo{display:flex;align-items:center;gap:.6rem}.meta{text-align:right;font-size:.75rem;color:#666}.sec{margin-bottom:1.1rem}.sec-t{font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.7px;color:#666;border-bottom:1px solid #eee;padding-bottom:.3rem;margin-bottom:.6rem}.box{background:#f5f3ff;border-left:4px solid #8b5cf6;border-radius:8px;padding:.85rem 1rem;margin-bottom:.5rem;font-size:.85rem;line-height:1.55}ol li{margin-bottom:.4rem;font-size:.85rem}table{width:100%;border-collapse:collapse;font-size:.8rem}th{text-align:left;padding:.5rem .7rem;background:#f5f3ff;border-bottom:2px solid #ddd;font-size:.69rem;text-transform:uppercase}td{padding:.45rem .7rem;border-bottom:1px solid #eee}.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #ddd;text-align:center;font-size:.7rem;color:#888}@media print{body{padding:1rem}}</style></head><body>
  <div class="header"><div class="logo"><div class="logo-icon">PR</div><div><h1>${p.nombre}</h1><div style="font-size:.75rem;color:#666;margin-top:.15rem">PrevRisk — Comercial Lafquen Ltda.</div></div></div><div class="meta"><div>Versión: <strong>${p.version||'v1.0'}</strong></div><div>Fecha: <strong>${p.fecha?formatDate(p.fecha):hoy}</strong></div><div>Actividad: <strong>${p.actividad||'—'}</strong></div></div></div>
  <div class="sec"><div class="sec-t">Objetivo</div><p style="font-size:.86rem;line-height:1.6;margin:0">${p.objetivo||'No definido.'}</p></div>
  <div class="sec"><div class="sec-t">Alcance</div><p style="font-size:.86rem;line-height:1.6;margin:0">${p.alcance||'No definido.'}</p></div>
  <div class="sec"><div class="sec-t">EPP Requerido</div><div class="box" style="background:#f0fdf4;border-color:#22c55e">${p.epp||'No especificado.'}</div></div>
  <div class="sec"><div class="sec-t">Riesgos Asociados</div><div class="box" style="background:#fef2f2;border-color:#ef4444">${p.riesgos||'No especificados.'}</div></div>
  <div class="sec"><div class="sec-t">Medidas de Control</div><div class="box">${p.medidas||'No especificadas.'}</div></div>
  ${(p.pasos||[]).length?`<div class="sec"><div class="sec-t">Paso a Paso</div><ol>${(p.pasos||[]).map(s=>`<li>${s.desc||''}</li>`).join('')}</ol></div>`:''}
  ${(p.firmas||[]).length?`<div class="sec"><div class="sec-t">Registro de Lecturas y Firmas</div><table><thead><tr><th>#</th><th>Trabajador</th><th>RUT</th><th>Cargo</th><th>Fecha</th></tr></thead><tbody>${(p.firmas||[]).map((f,i)=>`<tr style="background:${i%2?'#fff':'#f9fafc'}"><td>${i+1}</td><td>${f.nombre||'—'}</td><td>${f.rut||'—'}</td><td>${f.cargo||'—'}</td><td>${f.fecha?formatDate(f.fecha):'—'}</td></tr>`).join('')}</tbody></table></div>`:''}
  <div class="footer">Documento generado automáticamente por PrevRisk · ${hoy} · Comercial Lafquen Ltda.</div></body></html>`;
  const win=window.open('','_blank','width=900,height=700');
  if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500);}
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('ptsModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closePTSModal();});});

// ================================================================
// ===== MÓDULO 4: PLANES DE EMERGENCIA =====
// ================================================================
const PLAN_EMERG_KEY='prevrisk_planes_emerg';
let _planEmergRoles=[], _planEmergEmbFilter='todas';
function loadPlanesEmerg(){try{return JSON.parse(localStorage.getItem(PLAN_EMERG_KEY))||[];}catch{return[];}}
function savePlanesEmerg(d){localStorage.setItem(PLAN_EMERG_KEY,JSON.stringify(d));cloudSave('store/planes_emerg',d);}
const EMERG_TIPOS={abandono_nave:{label:'Abandono de Nave',icon:'directions_boat',color:'var(--danger)'},hombre_agua:{label:'Hombre al Agua',icon:'pool',color:'var(--info)'},incendio:{label:'Incendio a Bordo',icon:'local_fire_department',color:'var(--warning)'},varada:{label:'Varada',icon:'anchor',color:'var(--accent)'},otro:{label:'Otro',icon:'sos',color:'var(--text-muted)'}};
function refreshPlanEmerg(){
  const data=loadPlanesEmerg(); const f=_planEmergEmbFilter;
  const grid=document.getElementById('planEmergGrid');if(!grid)return;
  const filtered=f==='todas'?data:data.filter(p=>p.embarcacion===f);
  if(!filtered.length){grid.innerHTML=`<div style="text-align:center;padding:3rem;color:var(--text-muted);grid-column:1/-1">No hay planes de emergencia. Haz clic en "Nuevo Plan".</div>`;return;}
  grid.innerHTML=filtered.map(p=>{
    const t=EMERG_TIPOS[p.tipo]||EMERG_TIPOS.otro;
    const rolesCount=(p.roles||[]).length;
    return`<div class="panel" style="cursor:pointer" onclick="openPlanEmergModal('${p.id}')"><div class="panel-header" style="gap:.6rem"><span class="material-icons-round" style="color:${t.color};font-size:1.2rem">${t.icon}</span><div style="flex:1"><div style="font-weight:700;font-size:.88rem">${p.embarcacion||'—'}</div><div style="font-size:.72rem;color:var(--text-muted)">${t.label}</div></div><span class="material-icons-round" style="color:var(--text-muted);font-size:1rem">chevron_right</span></div><div class="panel-body"><p style="font-size:.8rem;color:var(--text-secondary);margin:0 0 .6rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${p.procedimiento||'Sin procedimiento registrado.'}</p><div style="display:flex;gap:.5rem;flex-wrap:wrap"><span style="background:var(--bg-hover);padding:.15rem .45rem;border-radius:6px;font-size:.72rem;color:var(--text-secondary);font-weight:600"><span class="material-icons-round" style="font-size:.75rem;vertical-align:middle">group</span> ${rolesCount} roles</span>${p.puntoEncuentro?`<span style="background:var(--bg-hover);padding:.15rem .45rem;border-radius:6px;font-size:.72rem;color:var(--text-secondary);font-weight:600"><span class="material-icons-round" style="font-size:.75rem;vertical-align:middle">place</span> ${p.puntoEncuentro.slice(0,30)}</span>`:''}</div></div></div>`;
  }).join('');
}
function setPlanEmergEmb(emb){
  _planEmergEmbFilter=emb;
  document.querySelectorAll('#planEmergTabs .filter-btn').forEach(b=>b.classList.toggle('active',b.textContent.trim()===(emb==='todas'?'Todas':emb)));
  refreshPlanEmerg();
}
function openPlanEmergModal(id=null){
  _planEmergRoles=[];
  const ov=document.getElementById('planEmergModalOverlay');if(!ov)return;
  if(id){
    const p=loadPlanesEmerg().find(i=>i.id===id);if(!p)return;
    document.getElementById('planEmergEmb').value=p.embarcacion||'';
    document.getElementById('planEmergTipo').value=p.tipo||'abandono_nave';
    document.getElementById('planEmergProcedimiento').value=p.procedimiento||'';
    document.getElementById('planEmergPunto').value=p.puntoEncuentro||'';
    document.getElementById('planEmergEquipos').value=p.equipos||'';
    document.getElementById('planEmergComun').value=p.comunicaciones||'';
    document.getElementById('planEmergId').value=id;
    _planEmergRoles=(p.roles||[]).map(r=>({...r}));
    document.getElementById('planEmergBtnDelete').style.display='block';
    document.getElementById('planEmergModalTitle').textContent='Editar Plan de Emergencia';
  }else{
    ['planEmergId','planEmergProcedimiento','planEmergPunto','planEmergEquipos','planEmergComun'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('planEmergBtnDelete').style.display='none';
    document.getElementById('planEmergModalTitle').textContent='Nuevo Plan de Emergencia';
  }
  renderPlanEmergRoles(); ov.classList.add('active');
}
function closePlanEmergModal(){const ov=document.getElementById('planEmergModalOverlay');if(ov)ov.classList.remove('active');}
function renderPlanEmergRoles(){
  const c=document.getElementById('planEmergRolesContainer');if(!c)return;
  if(!_planEmergRoles.length){c.innerHTML=`<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Sin roles asignados.</div>`;return;}
  c.innerHTML=_planEmergRoles.map((r,i)=>`<div style="display:grid;grid-template-columns:1fr 1fr 30px;gap:.4rem;align-items:center;background:var(--bg-hover);border-radius:var(--radius-sm);padding:.5rem .7rem;border:1px solid var(--border);margin-bottom:.35rem"><input type="text" value="${(r.cargo||'').replace(/"/g,'&quot;')}" placeholder="Cargo (Ej: Patrón)" style="font-size:.8rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_planEmergRoles[${i}].cargo=this.value"><input type="text" value="${(r.responsabilidad||'').replace(/"/g,'&quot;')}" placeholder="Responsabilidad en emergencia" style="font-size:.8rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_planEmergRoles[${i}].responsabilidad=this.value"><button onclick="_planEmergRoles.splice(${i},1);renderPlanEmergRoles()" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center"><span class="material-icons-round" style="font-size:.82rem">close</span></button></div>`).join('');
}
function planEmergAgregarRol(){_planEmergRoles.push({cargo:'',responsabilidad:''});renderPlanEmergRoles();}
function savePlanEmerg(){
  const emb=document.getElementById('planEmergEmb')?.value;
  if(!emb){showToast('Selecciona una embarcación','error');return;}
  const id=document.getElementById('planEmergId')?.value; const data=loadPlanesEmerg(); const isEdit=!!id;
  const rec={id:id||genId(),embarcacion:emb,tipo:document.getElementById('planEmergTipo')?.value||'abandono_nave',procedimiento:document.getElementById('planEmergProcedimiento')?.value||'',puntoEncuentro:document.getElementById('planEmergPunto')?.value||'',equipos:document.getElementById('planEmergEquipos')?.value||'',comunicaciones:document.getElementById('planEmergComun')?.value||'',roles:_planEmergRoles,updatedAt:new Date().toISOString()};
  if(isEdit){const idx=data.findIndex(i=>i.id===id);if(idx!==-1)data[idx]=rec;else data.push(rec);}else data.push(rec);
  savePlanesEmerg(data); addActivity(`Plan emergencia: <strong>${emb} — ${EMERG_TIPOS[rec.tipo]?.label||rec.tipo}</strong>`);
  showToast('Plan guardado ✓'); closePlanEmergModal(); refreshPlanEmerg();
}
function deletePlanEmerg(){
  const id=document.getElementById('planEmergId')?.value;
  if(!id||!confirm('¿Eliminar este plan?'))return;
  savePlanesEmerg(loadPlanesEmerg().filter(i=>i.id!==id));
  showToast('Plan eliminado','error'); closePlanEmergModal(); refreshPlanEmerg();
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('planEmergModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closePlanEmergModal();});});

// ================================================================
// ===== MÓDULO 5: CONTROL DE EQUIPOS Y COMPRESORES =====
// ================================================================
const EQ_KEY='prevrisk_equipos';
let _eqFilter='todos';
function loadEquipos(){try{return JSON.parse(localStorage.getItem(EQ_KEY))||[];}catch{return[];}}
function saveEquipos(d){localStorage.setItem(EQ_KEY,JSON.stringify(d));cloudSave('store/equipos',d);}
function refreshEquipos(){
  const data=loadEquipos(); const today=new Date().toISOString().split('T')[0];
  const in30=new Date(); in30.setDate(in30.getDate()+30); const in30s=in30.toISOString().split('T')[0];
  const q=(document.getElementById('eqSearch')?.value||'').toLowerCase();
  const f=_eqFilter;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('eqStatTotal',data.length);
  s('eqStatOperativos',data.filter(d=>d.estado==='operativo').length);
  s('eqStatPorMant',data.filter(d=>d.proxMant&&d.proxMant>=today&&d.proxMant<=in30s).length);
  s('eqStatFuera',data.filter(d=>d.estado==='fuera_servicio').length);
  let filtered=data.filter(d=>{
    if(f!=='todos'&&d.tipo!==f)return false;
    if(q&&!`${d.nombre} ${d.marca} ${d.serie} ${d.embarcacion}`.toLowerCase().includes(q))return false;
    return true;
  });
  const tbody=document.getElementById('equiposTableBody');if(!tbody)return;
  if(!filtered.length){tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted)">Sin equipos.</td></tr>`;return;}
  const tipoLabels={compresor_buceo:'Compresor Buceo',izaje:'Izaje',herr_electrica:'Herr. Eléctrica',nautico:'Náutico',otro:'Otro'};
  const estColors={operativo:{bg:'rgba(34,197,94,.12)',c:'var(--success)',l:'Operativo'},en_mant:{bg:'rgba(56,189,248,.12)',c:'var(--info)',l:'En Mantención'},fuera_servicio:{bg:'rgba(239,68,68,.12)',c:'var(--danger)',l:'Fuera de Servicio'}};
  tbody.innerHTML=filtered.map(d=>{
    const ec=estColors[d.estado]||estColors.operativo;
    const mantVenc=d.proxMant&&d.proxMant<today, mantProx=d.proxMant&&d.proxMant>=today&&d.proxMant<=in30s;
    const mantHTML=mantVenc?`<span style="color:var(--danger);font-size:.82rem;font-weight:700">${formatDate(d.proxMant)} ⚠</span>`:mantProx?`<span style="color:var(--warning);font-size:.82rem;font-weight:700">${formatDate(d.proxMant)}</span>`:d.proxMant?`<span style="font-size:.82rem">${formatDate(d.proxMant)}</span>`:`<span style="color:var(--text-muted)">—</span>`;
    return`<tr><td><div style="font-weight:700;font-size:.84rem">${d.nombre||'—'}</div><div style="font-size:.72rem;color:var(--text-muted)">${d.marca||''} ${d.serie?'· '+d.serie:''}</div></td><td><span style="background:var(--bg-hover);padding:.15rem .45rem;border-radius:6px;font-size:.72rem;font-weight:600;color:var(--text-secondary)">${tipoLabels[d.tipo]||d.tipo}</span></td><td style="font-size:.82rem">${d.embarcacion||'—'}</td><td style="font-size:.82rem">${d.ultMant?formatDate(d.ultMant):'—'}</td><td>${mantHTML}</td><td style="font-size:.82rem">${d.ultCalib?formatDate(d.ultCalib):'—'}</td><td><span style="background:${ec.bg};color:${ec.c};padding:.2rem .52rem;border-radius:7px;font-size:.69rem;font-weight:700">${ec.l}</span></td><td><div class="table-actions"><button onclick="openEquipoModal('${d.id}')" title="Editar"><span class="material-icons-round">edit</span></button></div></td></tr>`;
  }).join('');
}
function setEqFilter(f){_eqFilter=f;document.querySelectorAll('#eqFilterGroup .filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));refreshEquipos();}
function openEquipoModal(id=null){
  const ov=document.getElementById('equipoModalOverlay');if(!ov)return;
  if(id){
    const d=loadEquipos().find(i=>i.id===id);if(!d)return;
    ['nombre','tipo','marca','serie','embarcacion','estado','obs'].forEach(f=>{const e=document.getElementById('equipo'+f.charAt(0).toUpperCase()+f.slice(1));if(e)e.value=d[f]||'';});
    document.getElementById('equipoUltMant').value=d.ultMant||'';
    document.getElementById('equipoProxMant').value=d.proxMant||'';
    document.getElementById('equipoUltCalib').value=d.ultCalib||'';
    document.getElementById('equipoId').value=id;
    document.getElementById('equipoBtnDelete').style.display='block';
    document.getElementById('equipoModalTitle').textContent='Editar Equipo';
  }else{
    ['equipoId','equipoNombre','equipoMarca','equipoSerie','equipoObs','equipoUltMant','equipoProxMant','equipoUltCalib'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('equipoBtnDelete').style.display='none';
    document.getElementById('equipoModalTitle').textContent='Nuevo Equipo';
  }
  ov.classList.add('active');
}
function closeEquipoModal(){const ov=document.getElementById('equipoModalOverlay');if(ov)ov.classList.remove('active');}
function saveEquipo(){
  const nombre=document.getElementById('equipoNombre')?.value.trim();
  if(!nombre){showToast('Ingresa el nombre del equipo','error');return;}
  const id=document.getElementById('equipoId')?.value; const data=loadEquipos(); const isEdit=!!id;
  const rec={id:id||genId(),nombre,tipo:document.getElementById('equipoTipo')?.value||'otro',marca:document.getElementById('equipoMarca')?.value||'',serie:document.getElementById('equipoSerie')?.value||'',embarcacion:document.getElementById('equipoEmbarcacion')?.value||'',ultMant:document.getElementById('equipoUltMant')?.value||'',proxMant:document.getElementById('equipoProxMant')?.value||'',ultCalib:document.getElementById('equipoUltCalib')?.value||'',estado:document.getElementById('equipoEstado')?.value||'operativo',obs:document.getElementById('equipoObs')?.value||'',updatedAt:new Date().toISOString()};
  if(isEdit){const idx=data.findIndex(i=>i.id===id);if(idx!==-1)data[idx]=rec;else data.push(rec);}else data.push(rec);
  saveEquipos(data); addActivity(`Equipo ${isEdit?'actualizado':'registrado'}: <strong>${nombre}</strong>`);
  showToast(`Equipo ${isEdit?'actualizado':'guardado'} ✓`); closeEquipoModal(); refreshEquipos();
}
function deleteEquipo(){
  const id=document.getElementById('equipoId')?.value;
  if(!id||!confirm('¿Eliminar este equipo?'))return;
  saveEquipos(loadEquipos().filter(i=>i.id!==id));
  showToast('Equipo eliminado','error'); closeEquipoModal(); refreshEquipos();
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('equipoModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closeEquipoModal();});});

// ================================================================
// ===== MÓDULO 6: INSPECCIONES MEJORADAS =====
// ================================================================
const INSP_V2_KEY='prevrisk_inspecciones_v2';
let _inspV2Hallazgos=[], _inspV2Filter='todas';
function loadInspeccionesV2(){try{return JSON.parse(localStorage.getItem(INSP_V2_KEY))||[];}catch{return[];}}
function saveInspeccionesV2(d){localStorage.setItem(INSP_V2_KEY,JSON.stringify(d));cloudSave('store/inspecciones_v2',d);}
function refreshInspeccionesV2(){
  const data=loadInspeccionesV2(); const f=_inspV2Filter;
  const criticos=data.reduce((s,i)=>s+(i.hallazgos||[]).filter(h=>h.clasificacion==='critico'&&h.estado!=='cerrado').length,0);
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('inspStatTotal',data.length);
  s('inspStatCriticos',criticos);
  s('inspStatEnProceso',data.filter(d=>d.estado==='en_proceso').length);
  s('inspStatCerradas',data.filter(d=>d.estado==='cerrada').length);
  let filtered=data.filter(d=>f==='todas'||d.estado===f);
  const tbody=document.getElementById('inspTableBody');if(!tbody)return;
  if(!filtered.length){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-muted)">Sin resultados.</td></tr>`;return;}
  const ec={abierta:{bg:'rgba(239,68,68,.12)',c:'var(--danger)',l:'Abierta'},en_proceso:{bg:'rgba(56,189,248,.12)',c:'var(--info)',l:'En Proceso'},cerrada:{bg:'rgba(34,197,94,.12)',c:'var(--success)',l:'Cerrada'}};
  tbody.innerHTML=filtered.map(d=>{
    const e=ec[d.estado]||ec.abierta;
    const criticos=(d.hallazgos||[]).filter(h=>h.clasificacion==='critico').length;
    const total=(d.hallazgos||[]).length;
    return`<tr><td style="font-size:.82rem">${d.fecha?formatDate(d.fecha):'—'}</td><td style="font-weight:700;font-size:.84rem">${d.embarcacion||'—'}</td><td style="font-size:.82rem">${d.inspector||'—'}</td><td><span style="background:var(--bg-hover);padding:.15rem .45rem;border-radius:6px;font-size:.72rem;font-weight:600">${total} hallazgo(s)</span></td><td>${criticos>0?`<span style="background:rgba(239,68,68,.12);color:var(--danger);padding:.2rem .52rem;border-radius:7px;font-size:.69rem;font-weight:700">${criticos} crítico(s)</span>`:`<span style="color:var(--text-muted);font-size:.8rem">—</span>`}</td><td><span style="background:${e.bg};color:${e.c};padding:.2rem .52rem;border-radius:7px;font-size:.69rem;font-weight:700">${e.l}</span></td><td><div class="table-actions"><button onclick="openInspeccionV2Modal('${d.id}')" title="Editar"><span class="material-icons-round">edit</span></button></div></td></tr>`;
  }).join('');
}
function setInspFilter(f){_inspV2Filter=f;document.querySelectorAll('#inspFilterGroup .filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));refreshInspeccionesV2();}
function openInspeccionV2Modal(id=null){
  _inspV2Hallazgos=[];
  const ov=document.getElementById('inspeccionV2ModalOverlay');if(!ov)return;
  if(id){
    const d=loadInspeccionesV2().find(i=>i.id===id);if(!d)return;
    document.getElementById('inspV2Fecha').value=d.fecha||'';
    document.getElementById('inspV2Emb').value=d.embarcacion||'';
    document.getElementById('inspV2Inspector').value=d.inspector||'Bastian Ancapán Vera';
    document.getElementById('inspV2Estado').value=d.estado||'abierta';
    document.getElementById('inspV2Obs').value=d.obs||'';
    document.getElementById('inspV2Id').value=id;
    _inspV2Hallazgos=(d.hallazgos||[]).map(h=>({...h}));
    document.getElementById('inspV2BtnDelete').style.display='block';
    document.getElementById('inspeccionV2Title').textContent='Editar Inspección';
  }else{
    ['inspV2Id','inspV2Obs'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('inspV2Fecha').value=new Date().toISOString().split('T')[0];
    document.getElementById('inspV2Inspector').value='Bastian Ancapán Vera';
    document.getElementById('inspV2Estado').value='abierta';
    document.getElementById('inspV2BtnDelete').style.display='none';
    document.getElementById('inspeccionV2Title').textContent='Nueva Inspección';
  }
  renderInspV2Hallazgos(); ov.classList.add('active');
}
function closeInspeccionV2Modal(){const ov=document.getElementById('inspeccionV2ModalOverlay');if(ov)ov.classList.remove('active');}
function renderInspV2Hallazgos(){
  const c=document.getElementById('inspV2HallazgosContainer');if(!c)return;
  if(!_inspV2Hallazgos.length){c.innerHTML=`<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Agrega hallazgos encontrados.</div>`;return;}
  const clasColors={critico:{c:'var(--danger)',bg:'rgba(239,68,68,.12)'},mayor:{c:'var(--warning)',bg:'rgba(234,179,8,.12)'},menor:{c:'var(--info)',bg:'rgba(56,189,248,.12)'},observacion:{c:'var(--text-secondary)',bg:'var(--bg-hover)'}};
  c.innerHTML=_inspV2Hallazgos.map((h,i)=>`<div style="background:var(--bg-hover);border-radius:var(--radius-sm);padding:.6rem .75rem;border:1px solid var(--border);margin-bottom:.5rem"><div style="display:grid;grid-template-columns:1fr 110px 110px 100px 30px;gap:.4rem;align-items:center;margin-bottom:.35rem"><input type="text" value="${(h.desc||'').replace(/"/g,'&quot;')}" placeholder="Descripción del hallazgo..." style="font-size:.8rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_inspV2Hallazgos[${i}].desc=this.value"><select style="font-size:.75rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px" onchange="_inspV2Hallazgos[${i}].clasificacion=this.value"><option value="critico" ${h.clasificacion==='critico'?'selected':''}>Crítico</option><option value="mayor" ${h.clasificacion==='mayor'?'selected':''}>Mayor</option><option value="menor" ${h.clasificacion==='menor'?'selected':''}>Menor</option><option value="observacion" ${h.clasificacion==='observacion'?'selected':''}>Observación</option></select><input type="text" value="${(h.responsable||'').replace(/"/g,'&quot;')}" placeholder="Responsable" style="font-size:.78rem;border:none;background:transparent;color:var(--text);padding:0;text-align:center" oninput="_inspV2Hallazgos[${i}].responsable=this.value"><select style="font-size:.75rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.2rem .35rem;border-radius:5px" onchange="_inspV2Hallazgos[${i}].estado=this.value"><option value="abierto" ${h.estado==='abierto'?'selected':''}>Abierto</option><option value="en_proceso" ${h.estado==='en_proceso'?'selected':''}>En Proceso</option><option value="cerrado" ${h.estado==='cerrado'?'selected':''}>Cerrado</option></select><button onclick="_inspV2Hallazgos.splice(${i},1);renderInspV2Hallazgos()" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center"><span class="material-icons-round" style="font-size:.82rem">close</span></button></div><div style="display:flex;gap:.4rem;align-items:center"><span style="font-size:.7rem;color:var(--text-muted)">Plazo:</span><input type="date" value="${h.plazo||''}" style="font-size:.77rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.15rem .3rem;border-radius:5px" onchange="_inspV2Hallazgos[${i}].plazo=this.value"><span style="font-size:.7rem;color:var(--text-muted)">Foto/Link:</span><input type="text" value="${(h.fotoUrl||'').replace(/"/g,'&quot;')}" placeholder="Link Google Drive foto..." style="flex:1;font-size:.77rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:.15rem .4rem;border-radius:5px" onchange="_inspV2Hallazgos[${i}].fotoUrl=this.value"></div></div>`).join('');
}
function inspV2AgregarHallazgo(){_inspV2Hallazgos.push({id:genId(),desc:'',clasificacion:'menor',responsable:'',estado:'abierto',plazo:'',fotoUrl:''});renderInspV2Hallazgos();}
function saveInspeccionV2(){
  const emb=document.getElementById('inspV2Emb')?.value;
  if(!emb){showToast('Selecciona una embarcación','error');return;}
  const id=document.getElementById('inspV2Id')?.value; const data=loadInspeccionesV2(); const isEdit=!!id;
  const rec={id:id||genId(),fecha:document.getElementById('inspV2Fecha')?.value||'',embarcacion:emb,inspector:document.getElementById('inspV2Inspector')?.value||'',estado:document.getElementById('inspV2Estado')?.value||'abierta',obs:document.getElementById('inspV2Obs')?.value||'',hallazgos:_inspV2Hallazgos,updatedAt:new Date().toISOString()};
  if(isEdit){const idx=data.findIndex(i=>i.id===id);if(idx!==-1)data[idx]=rec;else data.push(rec);}else data.push(rec);
  saveInspeccionesV2(data); addActivity(`Inspección ${isEdit?'actualizada':'registrada'}: <strong>${emb}</strong> — ${(rec.hallazgos||[]).length} hallazgos`);
  showToast(`Inspección ${isEdit?'actualizada':'guardada'} ✓`); closeInspeccionV2Modal(); refreshInspeccionesV2();
}
function deleteInspeccionV2(){
  const id=document.getElementById('inspV2Id')?.value;
  if(!id||!confirm('¿Eliminar esta inspección?'))return;
  saveInspeccionesV2(loadInspeccionesV2().filter(i=>i.id!==id));
  showToast('Inspección eliminada','error'); closeInspeccionV2Modal(); refreshInspeccionesV2();
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('inspeccionV2ModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closeInspeccionV2Modal();});});

// ================================================================
// ===== MÓDULO 7: ESTADÍSTICAS DE ACCIDENTABILIDAD =====
// ================================================================
const HHT_KEY='prevrisk_hht';
let accStatChart2=null;
function loadHHT(){try{return JSON.parse(localStorage.getItem(HHT_KEY))||{};}catch{return {};}}
function saveHHT2(d){localStorage.setItem(HHT_KEY,JSON.stringify(d));cloudSave('store/hht',d);}

function refreshEstadisticasAcc(){
  const accs=loadAccidentes(); const hhtData=loadHHT();
  const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const year=new Date().getFullYear();
  let totalHHT=0, totalAcc=0, totalDias=0, ultimoAccFecha='';
  const filas=meses.map((mes,mi)=>{
    const key=`${year}-${String(mi+1).padStart(2,'0')}`;
    const hht=parseInt(hhtData[key])||0;
    const accMes=accs.filter(a=>{if(!a.fecha)return false;const d=new Date(a.fecha);return d.getFullYear()===year&&d.getMonth()===mi;});
    const nAcc=accMes.length;
    const dias=accMes.reduce((s,a)=>s+(parseInt(a.reposo)||0),0);
    const tf=hht>0?((nAcc*1000000)/hht).toFixed(1):'—';
    const tg=hht>0?((dias*1000000)/hht).toFixed(1):'—';
    const ta=hht>0?((nAcc*200000)/hht).toFixed(2):'—';
    totalHHT+=hht; totalAcc+=nAcc; totalDias+=dias;
    if(nAcc>0){const fechas=accMes.map(a=>a.fecha).sort();ultimoAccFecha=fechas[fechas.length-1]||ultimoAccFecha;}
    return{mes,nAcc,dias,hht,tf,tg,ta};
  });
  const tfTotal=totalHHT>0?((totalAcc*1000000)/totalHHT).toFixed(1):'—';
  const tgTotal=totalHHT>0?((totalDias*1000000)/totalHHT).toFixed(1):'—';
  const taTotal=totalHHT>0?((totalAcc*200000)/totalHHT).toFixed(2):'—';
  const diasSin=ultimoAccFecha?Math.max(0,Math.floor((new Date()-new Date(ultimoAccFecha))/(1000*60*60*24))):365;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('accStatTF',tfTotal); s('accStatTG',tgTotal); s('accStatTA',taTotal); s('accStatDiasSin',diasSin); s('accStatHHT',totalHHT.toLocaleString('es-CL')); s('accStatYear',year);
  const tbody=document.getElementById('accStatTableBody');
  if(tbody)tbody.innerHTML=filas.map(f=>`<tr><td style="font-weight:600">${f.mes}</td><td style="text-align:center;font-weight:700;color:${f.nAcc>0?'var(--danger)':'var(--text)'}">${f.nAcc}</td><td style="text-align:center">${f.dias}</td><td style="text-align:center">${f.hht.toLocaleString('es-CL')}</td><td style="text-align:center;color:${f.tf!=='—'&&parseFloat(f.tf)>0?'var(--warning)':'var(--text-muted)'}">${f.tf}</td><td style="text-align:center;color:${f.tg!=='—'&&parseFloat(f.tg)>0?'var(--warning)':'var(--text-muted)'}">${f.tg}</td><td style="text-align:center">${f.ta}</td></tr>`).join('');
  const ctx=document.getElementById('accStatChart');
  if(ctx&&window.Chart){
    if(accStatChart2)accStatChart2.destroy();
    accStatChart2=new Chart(ctx,{type:'bar',data:{labels:meses,datasets:[{label:'N° Accidentes',data:filas.map(f=>f.nAcc),backgroundColor:'rgba(239,68,68,.7)',borderRadius:4},{label:'Días Perdidos',data:filas.map(f=>f.dias),backgroundColor:'rgba(234,179,8,.5)',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#71717a',font:{size:11}}}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,color:'#71717a'},grid:{color:'rgba(255,255,255,.04)'}},x:{ticks:{color:'#71717a'},grid:{display:false}}}}});
  }
}
function openHHTModal(){
  const hhtData=loadHHT(); const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const year=new Date().getFullYear();
  const grid=document.getElementById('hhtInputsGrid');
  if(grid)grid.innerHTML=meses.map((m,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`;return`<div class="form-group"><label>${m} ${year}</label><input type="number" id="hht_${key}" min="0" value="${hhtData[key]||0}" placeholder="0" oninput="window._hhtTemp=window._hhtTemp||{};window._hhtTemp['${key}']=parseInt(this.value)||0"></div>`;}).join('');
  window._hhtTemp={...hhtData};
  document.getElementById('hhtModalOverlay')?.classList.add('active');
}
function closeHHTModal(){document.getElementById('hhtModalOverlay')?.classList.remove('active');}
function saveHHT(){
  const hhtData=loadHHT(); const year=new Date().getFullYear();
  for(let i=1;i<=12;i++){const key=`${year}-${String(i).padStart(2,'0')}`;const el=document.getElementById(`hht_${key}`);if(el)hhtData[key]=parseInt(el.value)||0;}
  saveHHT2(hhtData); showToast('HHT guardado ✓'); closeHHTModal(); refreshEstadisticasAcc();
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('hhtModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closeHHTModal();});});

// ================================================================
// ===== MÓDULO 8: KPI DASHBOARD DE SEGURIDAD =====
// ================================================================
function refreshKPIDashboard(){
  const grid=document.getElementById('kpiGrid');if(!grid)return;
  const today=new Date().toISOString().split('T')[0];
  const in30=new Date();in30.setDate(in30.getDate()+30);const in30s=in30.toISOString().split('T')[0];
  const items=loadItems(); const accs=loadAccidentes(); const exts=loadExtintores(); const epps=loadEPP();
  const docs=typeof loadDocControl==='function'?loadDocControl():[];
  const caps=typeof loadCapRegistros==='function'?loadCapRegistros():[];
  const thisMonthAcc=accs.filter(a=>{if(!a.fecha)return false;const d=new Date(a.fecha);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length;
  const ultimoAcc=accs.map(a=>a.fecha).filter(Boolean).sort().pop()||'';
  const diasSin=ultimoAcc?Math.max(0,Math.floor((new Date()-new Date(ultimoAcc))/(1000*60*60*24))):365;
  const totalItems=items.length; const compItems=items.filter(i=>i.status==='completada').length;
  const pctPrograma=totalItems>0?Math.round(compItems/totalItems*100):100;
  const extTotal=exts.filter(e=>e.estado!=='dado_baja').length; const extOk=exts.filter(e=>e.estado==='operativo').length;
  const pctExt=extTotal>0?Math.round(extOk/extTotal*100):100;
  const eppTotal=epps.length; const eppVig=epps.filter(e=>e.estado==='vigente'||(!e.vencimiento)).length;
  const pctEPP=eppTotal>0?Math.round(eppVig/eppTotal*100):100;
  const docVig=docs.filter(d=>d._estado==='vigente').length; const pctDoc=docs.length>0?Math.round(docVig/docs.length*100):100;
  const insp=typeof loadInspeccionesV2==='function'?loadInspeccionesV2():[];
  const inspMes=insp.filter(i=>{if(!i.fecha)return false;const d=new Date(i.fecha);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length;
  const kpis=[
    {label:'Prog. Preventivo',value:pctPrograma+'%',icon:'task_alt',semaforo:pctPrograma>=80?'green':pctPrograma>=50?'yellow':'red',desc:`${compItems}/${totalItems} completadas`},
    {label:'Acc. este Mes',value:thisMonthAcc,icon:'local_hospital',semaforo:thisMonthAcc===0?'green':thisMonthAcc<=2?'yellow':'red',desc:thisMonthAcc===0?'Sin accidentes':'Con accidentes'},
    {label:'Días sin Acc.',value:diasSin,icon:'event_available',semaforo:diasSin>=30?'green':diasSin>=7?'yellow':'red',desc:`Último: ${ultimoAcc?formatDate(ultimoAcc):'Ninguno'}`},
    {label:'Extintores Op.',value:pctExt+'%',icon:'fire_extinguisher',semaforo:pctExt>=90?'green':pctExt>=70?'yellow':'red',desc:`${extOk}/${extTotal} operativos`},
    {label:'EPP Vigentes',value:pctEPP+'%',icon:'security',semaforo:pctEPP>=90?'green':pctEPP>=70?'yellow':'red',desc:`${eppVig}/${eppTotal} vigentes`},
    {label:'Docs Vigentes',value:pctDoc+'%',icon:'manage_search',semaforo:pctDoc>=90?'green':pctDoc>=70?'yellow':'red',desc:`${docVig}/${docs.length} vigentes`},
    {label:'Insp. este Mes',value:inspMes,icon:'search',semaforo:inspMes>=2?'green':inspMes>=1?'yellow':'red',desc:inspMes===0?'Sin inspecciones':'Realizadas'},
    {label:'Caps. este Mes',value:caps.filter(c=>{if(!c.fecha)return false;const d=new Date(c.fecha);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length,icon:'school',semaforo:'green',desc:'Capacitaciones'},
  ];
  const sColor={green:'var(--success)',yellow:'var(--warning)',red:'var(--danger)'};
  const sBg={green:'rgba(34,197,94,.12)',yellow:'rgba(234,179,8,.12)',red:'rgba(239,68,68,.12)'};
  grid.innerHTML=kpis.map(k=>`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:.9rem 1rem;display:flex;align-items:center;gap:.75rem;transition:var(--transition)" onmouseenter="this.style.borderColor='${sColor[k.semaforo]}'" onmouseleave="this.style.borderColor='var(--border)'"><div style="width:40px;height:40px;border-radius:10px;background:${sBg[k.semaforo]};display:grid;place-items:center;flex-shrink:0"><span class="material-icons-round" style="color:${sColor[k.semaforo]};font-size:1.2rem">${k.icon}</span></div><div style="flex:1;min-width:0"><div style="font-size:1.35rem;font-weight:900;color:${sColor[k.semaforo]};line-height:1.1">${k.value}</div><div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);margin-top:.08rem">${k.label}</div><div style="font-size:.67rem;color:var(--text-muted);margin-top:.05rem">${k.desc}</div></div><div style="width:10px;height:10px;border-radius:50%;background:${sColor[k.semaforo]};box-shadow:0 0 8px ${sColor[k.semaforo]};flex-shrink:0"></div></div>`).join('');
}

// ================================================================
// ===== MÓDULO 9: CONTROL DE DOCUMENTOS =====
// ================================================================
const DOC_CTRL_KEY='prevrisk_doc_control';
let _docCtrlFilter='todos';
function loadDocControl(){
  try{
    const raw=JSON.parse(localStorage.getItem(DOC_CTRL_KEY))||[];
    const today=new Date().toISOString().split('T')[0];
    const in30=new Date();in30.setDate(in30.getDate()+30);const in30s=in30.toISOString().split('T')[0];
    return raw.map(d=>{
      const e=d.revision&&d.revision<today?'vencido':d.revision&&d.revision<=in30s?'por_revisar':'vigente';
      return{...d,_estado:e};
    });
  }catch{return[];}
}
function saveDocControl2(d){localStorage.setItem(DOC_CTRL_KEY,JSON.stringify(d));cloudSave('store/doc_control',d);}
function refreshDocControl(){
  const data=loadDocControl();
  const q=(document.getElementById('docControlSearch')?.value||'').toLowerCase();
  const f=_docCtrlFilter;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('docStatTotal',data.length);
  s('docStatVigentes',data.filter(d=>d._estado==='vigente').length);
  s('docStatPorRevisar',data.filter(d=>d._estado==='por_revisar').length);
  s('docStatVencidos',data.filter(d=>d._estado==='vencido').length);
  let filtered=data.filter(d=>{
    if(f!=='todos'&&d._estado!==f)return false;
    if(q&&!`${d.nombre} ${d.tipo} ${d.responsable}`.toLowerCase().includes(q))return false;
    return true;
  });
  const tbody=document.getElementById('docControlTableBody');if(!tbody)return;
  if(!filtered.length){tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted)">Sin documentos.</td></tr>`;return;}
  const ec={vigente:'doc-vigente',por_revisar:'doc-por-vencer',vencido:'doc-vencido'};
  const el={vigente:'Vigente',por_revisar:'Por Revisar',vencido:'Vencido'};
  const tipoL={reglamento:'Reglamento',procedimiento:'Procedimiento',instruccion:'Instrucción',certificacion:'Certificación',contrato:'Contrato',protocolo:'Protocolo',otro:'Otro'};
  tbody.innerHTML=filtered.map(d=>`<tr><td><div style="font-weight:700;font-size:.84rem">${d.nombre||'—'}</div>${d.desc?`<div style="font-size:.72rem;color:var(--text-muted)">${d.desc.slice(0,50)}</div>`:''}</td><td style="font-size:.82rem">${tipoL[d.tipo]||d.tipo||'—'}</td><td style="text-align:center;font-family:monospace;font-weight:700;font-size:.82rem">${d.version||'—'}</td><td style="font-size:.82rem">${d.emision?formatDate(d.emision):'—'}</td><td style="font-size:.82rem">${d.revision?formatDate(d.revision):'—'}</td><td style="font-size:.82rem">${d.responsable||'—'}</td><td><span class="doc-status ${ec[d._estado]||'doc-sin-venc'}">${el[d._estado]||'—'}</span></td><td><div class="table-actions">${d.link?`<a href="${d.link}" target="_blank" class="table-actions" style="color:var(--accent)"><span class="material-icons-round">open_in_new</span></a>`:''}<button onclick="openDocControlModal('${d.id}')" title="Editar"><span class="material-icons-round">edit</span></button></div></td></tr>`).join('');
}
function setDocControlFilter(f){_docCtrlFilter=f;document.querySelectorAll('#docControlFilterGroup .filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));refreshDocControl();}
function openDocControlModal(id=null){
  const ov=document.getElementById('docControlModalOverlay');if(!ov)return;
  if(id){
    const d=loadDocControl().find(i=>i.id===id);if(!d)return;
    ['nombre','tipo','version','emision','revision','responsable','link','desc'].forEach(f=>{const e=document.getElementById('docControl'+f.charAt(0).toUpperCase()+f.slice(1));if(e)e.value=d[f]||'';});
    document.getElementById('docControlId').value=id;
    document.getElementById('docControlBtnDelete').style.display='block';
    document.getElementById('docControlModalTitle').textContent='Editar Documento';
  }else{
    ['docControlId','docControlNombre','docControlLink','docControlDesc','docControlEmision','docControlRevision'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('docControlVersion').value='v1.0';
    document.getElementById('docControlResponsable').value='Bastian Ancapán Vera';
    document.getElementById('docControlBtnDelete').style.display='none';
    document.getElementById('docControlModalTitle').textContent='Nuevo Documento';
  }
  ov.classList.add('active');
}
function closeDocControlModal(){document.getElementById('docControlModalOverlay')?.classList.remove('active');}
function saveDocControl(){
  const nombre=document.getElementById('docControlNombre')?.value.trim();
  if(!nombre){showToast('Ingresa el nombre del documento','error');return;}
  const id=document.getElementById('docControlId')?.value; const data=loadDocControl(); const isEdit=!!id;
  const rec={id:id||genId(),nombre,tipo:document.getElementById('docControlTipo')?.value||'otro',version:document.getElementById('docControlVersion')?.value||'v1.0',emision:document.getElementById('docControlEmision')?.value||'',revision:document.getElementById('docControlRevision')?.value||'',responsable:document.getElementById('docControlResponsable')?.value||'',link:document.getElementById('docControlLink')?.value||'',desc:document.getElementById('docControlDesc')?.value||'',updatedAt:new Date().toISOString()};
  const cleanData=data.map(d=>{const{_estado,...rest}=d;return rest;});
  if(isEdit){const idx=cleanData.findIndex(i=>i.id===id);if(idx!==-1)cleanData[idx]=rec;else cleanData.push(rec);}else cleanData.push(rec);
  saveDocControl2(cleanData); addActivity(`Documento ${isEdit?'actualizado':'registrado'}: <strong>${nombre}</strong>`);
  showToast(`Documento ${isEdit?'actualizado':'guardado'} ✓`); closeDocControlModal(); refreshDocControl();
}
function deleteDocControl(){
  const id=document.getElementById('docControlId')?.value;
  if(!id||!confirm('¿Eliminar este documento?'))return;
  const data=loadDocControl().map(d=>{const{_estado,...r}=d;return r;}).filter(i=>i.id!==id);
  saveDocControl2(data); showToast('Documento eliminado','error'); closeDocControlModal(); refreshDocControl();
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('docControlModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closeDocControlModal();});});

// ================================================================
// ===== MÓDULO 10: REGISTRO DE CAPACITACIONES =====
// ================================================================
const CAP_REG_KEY='prevrisk_cap_registro';
let _capAsistentes=[], _capFilter='todos';
function loadCapRegistros(){try{return JSON.parse(localStorage.getItem(CAP_REG_KEY))||[];}catch{return[];}}
function saveCapRegistros(d){localStorage.setItem(CAP_REG_KEY,JSON.stringify(d));cloudSave('store/cap_registro',d);}
function refreshCapRegistro(){
  const data=loadCapRegistros(); const personal=loadPersonal();
  const q=(document.getElementById('capSearch')?.value||'').toLowerCase(); const f=_capFilter;
  const totalAsistentes=data.reduce((s,c)=>s+(c.asistentes||[]).length,0);
  const hace3m=new Date(); hace3m.setMonth(hace3m.getMonth()-3); const hace3ms=hace3m.toISOString().split('T')[0];
  const sin3meses=personal.filter(p=>{const caps=data.filter(c=>(c.asistentes||[]).some(a=>a.nombre===p.nombre));if(!caps.length)return true;const ultima=caps.map(c=>c.fecha).filter(Boolean).sort().pop()||'';return ultima<hace3ms;}).length;
  const planAnual=loadItems().filter(i=>i.category==='capacitacion').length;
  const realizadas=data.length; const pct=planAnual>0?Math.min(100,Math.round(realizadas/planAnual*100)):realizadas>0?100:0;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('capStatTotal',data.length); s('capStatAsistentes',totalAsistentes); s('capStatSin3Meses',sin3meses); s('capStatCumplimiento',pct+'%');
  let filtered=data.filter(d=>{
    if(f!=='todos'&&d.categoria!==f)return false;
    if(q&&!`${d.tema} ${d.relator} ${d.lugar}`.toLowerCase().includes(q))return false;
    return true;
  });
  const tbody=document.getElementById('capTableBody');if(!tbody)return;
  if(!filtered.length){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-muted)">Sin capacitaciones registradas.</td></tr>`;return;}
  const catL={buceo:'Buceo',emergencias:'Emergencias',legal:'Legal/SST',epp:'EPP',otro:'Otro'};
  const catC={buceo:'rgba(56,189,248,.12)',emergencias:'rgba(239,68,68,.12)',legal:'rgba(139,92,246,.12)',epp:'rgba(234,179,8,.12)',otro:'var(--bg-hover)'};
  const catT={buceo:'var(--info)',emergencias:'var(--danger)',legal:'var(--accent-light)',epp:'var(--warning)',otro:'var(--text-muted)'};
  tbody.innerHTML=filtered.map(c=>`<tr><td><div style="font-weight:700;font-size:.84rem">${c.tema||'—'}</div>${c.desc?`<div style="font-size:.72rem;color:var(--text-muted)">${c.desc.slice(0,50)}</div>`:''}</td><td><span style="background:${catC[c.categoria]||'var(--bg-hover)'};color:${catT[c.categoria]||'var(--text-muted)'};padding:.2rem .52rem;border-radius:7px;font-size:.69rem;font-weight:700">${catL[c.categoria]||c.categoria}</span></td><td style="font-size:.82rem">${c.fecha?formatDate(c.fecha):'—'}</td><td style="font-size:.82rem">${c.relator||'—'}</td><td><span style="background:rgba(34,197,94,.12);color:var(--success);padding:.15rem .45rem;border-radius:6px;font-size:.72rem;font-weight:700">${(c.asistentes||[]).length} personas</span></td><td style="font-size:.82rem">${c.duracion||'—'} hrs</td><td><div class="table-actions"><button onclick="openCapRegistroModal('${c.id}')" title="Editar"><span class="material-icons-round">edit</span></button><button onclick="imprimirCapRegistro('${c.id}')" title="Imprimir lista"><span class="material-icons-round">print</span></button></div></td></tr>`).join('');
  const cargos=['Buzo Básico','Supervisor de Buceo','Patrón de Nave','Tripulante','Motorista','Cocinero','Operario'];
  const cumGrid=document.getElementById('capCumplimientoGrid');
  if(cumGrid){
    const hace12m=new Date();hace12m.setFullYear(hace12m.getFullYear()-1);const hace12s=hace12m.toISOString().split('T')[0];
    cumGrid.innerHTML=cargos.map(cargo=>{
      const trabajadores=personal.filter(p=>p.cargo===cargo);if(!trabajadores.length)return'';
      const conCap=trabajadores.filter(p=>data.some(c=>c.fecha&&c.fecha>=hace12s&&(c.asistentes||[]).some(a=>a.nombre===p.nombre))).length;
      const pct=trabajadores.length>0?Math.round(conCap/trabajadores.length*100):0;
      const color=pct>=80?'var(--success)':pct>=50?'var(--warning)':'var(--danger)';
      return`<div class="cat-bar-item"><label>${cargo}<span style="color:${color};font-weight:700">${pct}% (${conCap}/${trabajadores.length})</span></label><div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div></div></div>`;
    }).join('');
  }
}
function setCapFilter(f){_capFilter=f;document.querySelectorAll('#capFilterGroup .filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));refreshCapRegistro();}
function openCapRegistroModal(id=null){
  _capAsistentes=[];
  const ov=document.getElementById('capRegistroModalOverlay');if(!ov)return;
  if(id){
    const c=loadCapRegistros().find(i=>i.id===id);if(!c)return;
    ['tema','categoria','relator','lugar','desc'].forEach(f=>{const e=document.getElementById('cap'+f.charAt(0).toUpperCase()+f.slice(1));if(e)e.value=c[f]||'';});
    document.getElementById('capFecha').value=c.fecha||'';
    document.getElementById('capDuracion').value=c.duracion||2;
    document.getElementById('capRegistroId').value=id;
    _capAsistentes=(c.asistentes||[]).map(a=>({...a}));
    document.getElementById('capRegistroBtnDelete').style.display='block';
    document.getElementById('capRegistroModalTitle').textContent='Editar Capacitación';
  }else{
    ['capRegistroId','capTema','capRelator','capLugar','capDesc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('capFecha').value=new Date().toISOString().split('T')[0];
    document.getElementById('capDuracion').value=2;
    document.getElementById('capRegistroBtnDelete').style.display='none';
    document.getElementById('capRegistroModalTitle').textContent='Registrar Capacitación';
  }
  renderCapAsistentes(); ov.classList.add('active');
}
function closeCapRegistroModal(){document.getElementById('capRegistroModalOverlay')?.classList.remove('active');}
function renderCapAsistentes(){
  const c=document.getElementById('capAsistentesContainer');if(!c)return;
  if(!_capAsistentes.length){c.innerHTML=`<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem;border:1px dashed var(--border-strong);border-radius:var(--radius-sm)">Agrega los asistentes.</div>`;return;}
  c.innerHTML=_capAsistentes.map((a,i)=>`<div style="display:grid;grid-template-columns:1fr 100px 120px 90px 30px;gap:.4rem;align-items:center;background:var(--bg-hover);border-radius:var(--radius-sm);padding:.5rem .7rem;border:1px solid var(--border);margin-bottom:.35rem"><input type="text" value="${(a.nombre||'').replace(/"/g,'&quot;')}" placeholder="Nombre completo" style="font-size:.8rem;border:none;background:transparent;color:var(--text);padding:0" oninput="_capAsistentes[${i}].nombre=this.value"><input type="text" value="${(a.rut||'').replace(/"/g,'&quot;')}" placeholder="RUT" style="font-size:.78rem;border:none;background:transparent;color:var(--text);padding:0;text-align:center" oninput="_capAsistentes[${i}].rut=this.value"><input type="text" value="${(a.cargo||'').replace(/"/g,'&quot;')}" placeholder="Cargo" style="font-size:.78rem;border:none;background:transparent;color:var(--text);padding:0;text-align:center" oninput="_capAsistentes[${i}].cargo=this.value"><input type="text" value="${(a.firma||'').replace(/"/g,'&quot;')}" placeholder="Firma/Sello" style="font-size:.78rem;border:none;background:transparent;color:var(--text);padding:0;text-align:center" oninput="_capAsistentes[${i}].firma=this.value"><button onclick="_capAsistentes.splice(${i},1);renderCapAsistentes()" style="background:rgba(239,68,68,.12);color:var(--danger);border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:grid;place-items:center"><span class="material-icons-round" style="font-size:.82rem">close</span></button></div>`).join('');
}
function capAgregarAsistente(){_capAsistentes.push({nombre:'',rut:'',cargo:'',firma:''});renderCapAsistentes();}
function saveCapRegistro(){
  const tema=document.getElementById('capTema')?.value.trim();
  if(!tema){showToast('Ingresa el tema de la capacitación','error');return;}
  const id=document.getElementById('capRegistroId')?.value; const data=loadCapRegistros(); const isEdit=!!id;
  const rec={id:id||genId(),tema,categoria:document.getElementById('capCategoria')?.value||'otro',fecha:document.getElementById('capFecha')?.value||'',duracion:parseInt(document.getElementById('capDuracion')?.value)||0,relator:document.getElementById('capRelator')?.value||'',lugar:document.getElementById('capLugar')?.value||'',desc:document.getElementById('capDesc')?.value||'',asistentes:_capAsistentes,updatedAt:new Date().toISOString()};
  if(isEdit){const idx=data.findIndex(i=>i.id===id);if(idx!==-1)data[idx]=rec;else data.push(rec);}else data.push(rec);
  saveCapRegistros(data); addActivity(`Capacitación ${isEdit?'actualizada':'registrada'}: <strong>${tema}</strong> — ${rec.asistentes.length} asistentes`);
  showToast(`Capacitación ${isEdit?'actualizada':'guardada'} ✓`); closeCapRegistroModal(); refreshCapRegistro();
}
function deleteCapRegistro(){
  const id=document.getElementById('capRegistroId')?.value;
  if(!id||!confirm('¿Eliminar esta capacitación?'))return;
  saveCapRegistros(loadCapRegistros().filter(i=>i.id!==id));
  showToast('Capacitación eliminada','error'); closeCapRegistroModal(); refreshCapRegistro();
}
function imprimirCapRegistro(id){
  const c=loadCapRegistros().find(i=>i.id===id);if(!c)return;
  const hoy=new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Registro Capacitación</title><style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:2rem;color:#1a1d27;background:#fff}h1{font-size:1.2rem;font-weight:800;margin:0}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #8b5cf6;padding-bottom:1rem;margin-bottom:1.5rem}.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem}.logo{display:flex;align-items:center;gap:.6rem}.meta{text-align:right;font-size:.75rem;color:#666}.info-box{background:#f5f3ff;border-radius:10px;padding:.9rem 1.1rem;margin-bottom:1.3rem;display:grid;grid-template-columns:1fr 1fr 1fr;gap:.8rem;font-size:.83rem}.il{font-size:.68rem;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.4px}.iv{font-weight:700;margin-top:.1rem}table{width:100%;border-collapse:collapse;font-size:.82rem}th{text-align:left;padding:.55rem .75rem;background:#f5f3ff;border-bottom:2px solid #ddd;font-size:.69rem;text-transform:uppercase}td{padding:.5rem .75rem;border-bottom:1px solid #eee}.sign-row td{height:50px;border-bottom:1px solid #ccc}.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #ddd;text-align:center;font-size:.7rem;color:#888}@media print{body{padding:1rem}}</style></head><body>
  <div class="header"><div class="logo"><div class="logo-icon">PR</div><div><h1>Registro de Capacitación</h1><div style="font-size:.75rem;color:#666;margin-top:.15rem">PrevRisk — Comercial Lafquen Ltda.</div></div></div><div class="meta"><div>Folio: CAP-${c.id.slice(-6).toUpperCase()}</div><div>Fecha Impresión: ${hoy}</div></div></div>
  <div class="info-box"><div><div class="il">Tema</div><div class="iv">${c.tema||'—'}</div></div><div><div class="il">Fecha</div><div class="iv">${c.fecha?formatDate(c.fecha):'—'}</div></div><div><div class="il">Duración</div><div class="iv">${c.duracion||0} horas</div></div><div><div class="il">Relator</div><div class="iv">${c.relator||'—'}</div></div><div><div class="il">Lugar</div><div class="iv">${c.lugar||'—'}</div></div><div><div class="il">N° Asistentes</div><div class="iv">${(c.asistentes||[]).length}</div></div></div>
  ${c.desc?`<p style="font-size:.84rem;margin-bottom:1.2rem;line-height:1.55">${c.desc}</p>`:''}
  <table><thead><tr><th>#</th><th>Nombre Completo</th><th>RUT</th><th>Cargo</th><th>Firma</th></tr></thead>
  <tbody class="sign-row">${(c.asistentes||[]).map((a,i)=>`<tr class="sign-row"><td style="font-weight:700;color:#999">${i+1}</td><td>${a.nombre||''}</td><td>${a.rut||''}</td><td>${a.cargo||''}</td><td style="min-width:120px">${a.firma||''}</td></tr>`).join('')}</tbody></table>
  <div class="footer">Documento generado automáticamente por PrevRisk · ${hoy} · Comercial Lafquen Ltda.</div></body></html>`;
  const win=window.open('','_blank','width=900,height=700');
  if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500);}
}
document.addEventListener('DOMContentLoaded',()=>{const ov=document.getElementById('capRegistroModalOverlay');if(ov)ov.addEventListener('click',e=>{if(e.target===ov)closeCapRegistroModal();});});

// ================================================================
// ===== ACTUALIZAR refreshAll CON TODOS LOS MÓDULOS =====
// ================================================================
const _baseRefreshAll=refreshAll;
refreshAll=function(){
  _baseRefreshAll.apply(this,arguments);
  const active=id=>document.getElementById(id)?.classList.contains('active');
  if(active('view-salud-ocup'))refreshSaludOcup();
  if(active('view-pts'))refreshPTS();
  if(active('view-plan-emerg'))refreshPlanEmerg();
  if(active('view-equipos'))refreshEquipos();
  if(active('view-inspecciones-v2'))refreshInspeccionesV2();
  if(active('view-estadisticas-acc'))refreshEstadisticasAcc();
  if(active('view-doc-control'))refreshDocControl();
  if(active('view-cap-registro'))refreshCapRegistro();
  if(document.getElementById('kpiGrid'))refreshKPIDashboard();
};

// ================================================================
// ===== ALERTAS INTEGRADAS MÓDULOS 2-10 =====
// ================================================================
const _origRenderNotif_all=renderNotifList;
renderNotifList=function(){
  _origRenderNotif_all.apply(this,arguments);
  const list=document.getElementById('notifList'),badge=document.getElementById('notifBadge');
  if(!list)return;
  const today=new Date().toISOString().split('T')[0];
  const in30=new Date();in30.setDate(in30.getDate()+30);const in30s=in30.toISOString().split('T')[0];
  const alerts2=[];
  // Salud Ocupacional: exámenes vencidos
  const saludVenc=loadSaludOcup().filter(d=>d.proxExamen&&d.proxExamen<today);
  if(saludVenc.length)alerts2.push({icon:'monitor_heart',color:'var(--danger)',title:`${saludVenc.length} examen(es) ocupacional(es) vencido(s)`,desc:saludVenc.slice(0,2).map(d=>d.nombre).join(', ')});
  // Equipos: mantención vencida
  const eqVenc=loadEquipos().filter(e=>e.proxMant&&e.proxMant<today&&e.estado!=='fuera_servicio');
  if(eqVenc.length)alerts2.push({icon:'build',color:'var(--warning)',title:`${eqVenc.length} equipo(s) con mantención vencida`,desc:eqVenc.slice(0,2).map(e=>e.nombre).join(', ')});
  // Documentos por revisar
  const docCtrl=loadDocControl().filter(d=>d._estado==='vencido');
  if(docCtrl.length)alerts2.push({icon:'manage_search',color:'var(--danger)',title:`${docCtrl.length} documento(s) de control vencido(s)`,desc:docCtrl.slice(0,2).map(d=>d.nombre).join(', ')});
  // Sin capacitación 3 meses
  const personal2=loadPersonal();const capData=loadCapRegistros();
  const hace3m=new Date();hace3m.setMonth(hace3m.getMonth()-3);const hace3s=hace3m.toISOString().split('T')[0];
  const sinCap=personal2.filter(p=>{const caps=capData.filter(c=>(c.asistentes||[]).some(a=>a.nombre===p.nombre));if(!caps.length)return true;const ultima=caps.map(c=>c.fecha).filter(Boolean).sort().pop()||'';return ultima<hace3s;});
  if(sinCap.length)alerts2.push({icon:'school',color:'var(--warning)',title:`${sinCap.length} trabajador(es) sin capacitación (3+ meses)`,desc:sinCap.slice(0,2).map(p=>p.nombre).join(', ')});
  // Inspecciones con hallazgos críticos abiertos
  const inspCrit=loadInspeccionesV2().filter(i=>i.estado!=='cerrada'&&(i.hallazgos||[]).some(h=>h.clasificacion==='critico'&&h.estado!=='cerrado'));
  if(inspCrit.length)alerts2.push({icon:'dangerous',color:'var(--danger)',title:`${inspCrit.length} inspección(es) con hallazgos críticos abiertos`,desc:inspCrit.slice(0,2).map(i=>i.embarcacion).join(', ')});
  alerts2.forEach(a=>{
    const entry=document.createElement('div');
    entry.style.cssText='padding:.8rem 1.2rem;border-bottom:1px solid var(--border);display:flex;gap:.75rem;align-items:flex-start;';
    entry.innerHTML=`<span class="material-icons-round" style="color:${a.color};font-size:1.2rem;flex-shrink:0;">${a.icon}</span><div><div style="font-size:.82rem;font-weight:700;">${a.title}</div><div style="font-size:.72rem;color:var(--text-secondary);margin-top:.1rem;">${a.desc}</div></div>`;
    list.appendChild(entry);
    if(badge)badge.style.display='block';
  });
};

// ================================================================
function initNotificationBell(){const btn=document.getElementById('btnNotifBell'),dd=document.getElementById('notifDropdown');if(!btn||!dd)return;btn.addEventListener('click',e=>{e.stopPropagation();dd.style.display=dd.style.display==='block'?'none':'block';if(dd.style.display==='block')renderNotifList();});document.addEventListener('click',e=>{if(!btn.contains(e.target)&&!dd.contains(e.target))dd.style.display='none';});}
function renderNotifList(){const list=document.getElementById('notifList'),badge=document.getElementById('notifBadge');if(!list)return;const today=new Date(),items=loadItems(),files=loadFilesMeta(),personal=loadPersonal(),alerts=[];const od=items.filter(i=>i.status!=='completada'&&i.dueDate&&new Date(i.dueDate)<today);if(od.length)alerts.push({icon:'warning',color:'var(--danger)',title:od.length+' tarea(s) vencidas',desc:od.slice(0,2).map(i=>i.title).join(', ')});const s30=new Date(today);s30.setDate(s30.getDate()+30);const ef=files.filter(f=>f.vencimiento&&new Date(f.vencimiento)>=today&&new Date(f.vencimiento)<=s30);if(ef.length)alerts.push({icon:'event_upcoming',color:'var(--warning)',title:ef.length+' documento(s) por vencer',desc:'Próximos 30 días'});const ep=personal.filter(p=>(p.vencExamen&&new Date(p.vencExamen)<today)||(p.vencMatricula&&new Date(p.vencMatricula)<today));if(ep.length)alerts.push({icon:'badge',color:'var(--warning)',title:ep.length+' trabajador(es) con docs vencidos',desc:ep.slice(0,2).map(p=>p.nombre).join(', ')});if(badge)badge.style.display=alerts.length?'block':'none';if(!alerts.length){list.innerHTML='<div style="padding:2rem 1.2rem;text-align:center;color:var(--text-muted);font-size:.85rem;">Sin alertas activas</div>';return;}list.innerHTML=alerts.map(a=>`<div style="padding:.8rem 1.2rem;border-bottom:1px solid var(--border);display:flex;gap:.75rem;align-items:flex-start;"><span class="material-icons-round" style="color:${a.color};font-size:1.2rem;flex-shrink:0;">${a.icon}</span><div><div style="font-size:.82rem;font-weight:700;">${a.title}</div><div style="font-size:.72rem;color:var(--text-secondary);margin-top:.1rem;">${a.desc}</div></div></div>`).join('');}