// Display helpers shared by the Flutter apps. Money is integer paise; times are UTC shown in IST.
// Mirrors packages/mobile-ui/src/format.ts so both app generations format identically.

const Duration _istOffset = Duration(minutes: 330);

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // DateTime.weekday 1..7

/// ₹1,100 or ₹52.38, with Indian digit grouping (₹1,00,000). Null shows "—".
String inr(int? paise) {
  if (paise == null) return '—';
  final negative = paise < 0;
  final abs = paise.abs();
  final rupees = abs ~/ 100;
  final cents = abs % 100;
  final digits = rupees.toString();
  String grouped;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    final last3 = digits.substring(digits.length - 3);
    var rest = digits.substring(0, digits.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    grouped = '${parts.join(',')},$last3';
  }
  final decimals = cents == 0 ? '' : '.${cents.toString().padLeft(2, '0')}';
  return '${negative ? '-' : ''}₹$grouped$decimals';
}

/// Rupees typed by a user ("550", "52.5", "₹1,200") to paise, or null if not a valid amount.
int? paiseFromInput(String input) {
  final v = input.trim().replaceAll(RegExp(r'[₹,\s]'), '');
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(v)) return null;
  final parts = v.split('.');
  final whole = int.parse(parts[0]);
  final frac = parts.length > 1 ? int.parse(parts[1].padRight(2, '0')) : 0;
  return whole * 100 + frac;
}

DateTime _ist(DateTime d) => d.toUtc().add(_istOffset);
DateTime _parse(Object d) => d is DateTime ? d : DateTime.parse(d as String);

/// "7:30 AM"
String time(Object d) {
  final t = _ist(_parse(d));
  final h12 = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h12:${t.minute.toString().padLeft(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}';
}

/// "Sat, 1 Nov"
String dayLabel(Object d) {
  final t = _ist(_parse(d));
  return '${_days[t.weekday - 1]}, ${t.day} ${_months[t.month - 1]}';
}

/// "Today", "Tomorrow", "Yesterday" or "Sat, 1 Nov"
String relativeDay(Object d, {DateTime? now}) {
  final a = _ist(_parse(d));
  final b = _ist(now ?? DateTime.now());
  final days = DateTime.utc(a.year, a.month, a.day).difference(DateTime.utc(b.year, b.month, b.day)).inDays;
  if (days == 0) return 'Today';
  if (days == 1) return 'Tomorrow';
  if (days == -1) return 'Yesterday';
  return dayLabel(d);
}

/// "Tomorrow, 7:30 AM"
String dateTime(Object d, {DateTime? now}) => '${relativeDay(d, now: now)}, ${time(d)}';

/// "2h 45m"
String duration(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '${m}m';
  return m == 0 ? '${h}h' : '${h}h ${m}m';
}

/// "+91 98765 43210"
String phone(String? p) {
  if (p == null || p.isEmpty) return '—';
  final m = RegExp(r'^\+91(\d{5})(\d{5})$').firstMatch(p);
  return m == null ? p : '+91 ${m.group(1)} ${m.group(2)}';
}

String _ymd(DateTime t) => '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';

/// Today's IST date as YYYY-MM-DD, plus [addDays].
String istDateString({int addDays = 0, DateTime? now}) => _ymd(_ist((now ?? DateTime.now()).add(Duration(days: addDays))));

/// UTC instant for an IST date ("2026-11-01") and time ("07:30").
DateTime istToUtc(String date, String hhmm) {
  final p = date.split('-').map(int.parse).toList();
  final t = hhmm.split(':').map(int.parse).toList();
  return DateTime.utc(p[0], p[1], p[2], t[0], t[1]).subtract(_istOffset);
}

/// IST date (YYYY-MM-DD) and time (HH:MM) of an instant.
({String date, String time}) utcToIst(Object d) {
  final t = _ist(_parse(d));
  return (date: _ymd(t), time: '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}');
}

String initials(String? name) {
  final words = (name ?? '?').trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2);
  final s = words.map((w) => w[0].toUpperCase()).join();
  return s.isEmpty ? '?' : s;
}
