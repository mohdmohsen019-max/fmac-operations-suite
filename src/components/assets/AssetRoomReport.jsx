import { statusLabel, roomLabel, fmtDate } from './shared'

// Offscreen A4 report document (794×1122px pages) captured by html2canvas → jsPDF.
// Bilingual EN/AR per asset row, Cairo font, RTL-aware. One section per selected room;
// each room starts on its own page when "All Rooms" is chosen.
const TODAY = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function RoomPage({ room, assets, lang }) {
  return (
    <div className="ast-report-page">
      <div className="ast-report-head">
        <img src="/fmac-ops-logo.png" alt="FMAC" className="ast-report-logo" />
        <div className="ast-report-head-text">
          <div className="ast-report-title-en">Assets Report</div>
          <div className="ast-report-title-ar">تقرير الأصول</div>
        </div>
        <div className="ast-report-date">{TODAY()}</div>
      </div>
      <div className="ast-report-rule" />

      <div className="ast-report-room-bar">
        <span className="ast-report-room-en">{room.name_en || '—'}</span>
        <span className="ast-report-room-ar">{room.name_ar || '—'}</span>
      </div>
      <div className="ast-report-room-sub">
        {room.floor ? `${room.floor} · ` : ''}{assets.length} assets / أصل
      </div>

      <table className="ast-report-table">
        <thead>
          <tr>
            <th>Barcode<br/><span>الباركود</span></th>
            <th>Name (EN)<br/><span>الاسم</span></th>
            <th>Name (AR)<br/><span>الاسم بالعربية</span></th>
            <th>Category<br/><span>الفئة</span></th>
            <th>Type<br/><span>النوع</span></th>
            <th>Status<br/><span>الحالة</span></th>
            <th>Assigned To<br/><span>مُعيَّن إلى</span></th>
          </tr>
        </thead>
        <tbody>
          {assets.length === 0 ? (
            <tr><td colSpan={7} className="ast-report-empty">No assets in this room / لا توجد أصول في هذه الغرفة</td></tr>
          ) : assets.map(a => (
            <tr key={a.id}>
              <td className="ast-report-mono">{a.barcode || '—'}</td>
              <td>{a.name_en || '—'}</td>
              <td dir="rtl" className="ast-report-ar">{a.name_ar || '—'}</td>
              <td>{a.category || '—'}</td>
              <td>{a.type || '—'}</td>
              <td>{statusLabel(a.status, 'en')} / {statusLabel(a.status, 'ar')}</td>
              <td>{a.assigned_to || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ast-report-footer">
        Fujairah Martial Arts Club — Assets Report · نادي الفجيرة للفنون القتالية — تقرير الأصول
      </div>
    </div>
  )
}

export default function AssetRoomReport({ rooms, assets, lang }) {
  const assetsByRoom = (roomId) => assets.filter(a => a.location_room === roomId)
  return (
    <div className="ast-report-root" id="ast-report-root">
      {rooms.map(room => (
        <RoomPage key={room.id} room={room} assets={assetsByRoom(room.id)} lang={lang} />
      ))}
    </div>
  )
}
