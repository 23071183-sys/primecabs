// Date and time choices for publishing a ride, and document expiry dates. All in IST.
import 'format.dart';

class DayOption {
  const DayOption({required this.date, required this.weekday, required this.day, required this.month});
  final String date; // YYYY-MM-DD
  final String weekday; // "Today", "Tmrw", "Tue"
  final int day;
  final String month;
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// The next [count] IST days starting today.
List<DayOption> nextDays(int count, {DateTime? now}) {
  return List.generate(count, (i) {
    final date = istDateString(addDays: i, now: now);
    final p = date.split('-').map(int.parse).toList();
    final wd = DateTime.utc(p[0], p[1], p[2]).weekday;
    return DayOption(
      date: date,
      weekday: i == 0 ? 'Today' : (i == 1 ? 'Tmrw' : _weekdays[wd - 1]),
      day: p[2],
      month: _months[p[1] - 1],
    );
  });
}

/// 4 AM to 11 PM.
final List<int> departureHours = List.generate(20, (i) => i + 4);
const List<String> departureMinutes = ['00', '15', '30', '45'];

String hourLabel(int h) => '${h % 12 == 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}';

/// A departure instant, or an error explaining why the choice can't be used.
sealed class Departure {
  const Departure();
}

class DepartureOk extends Departure {
  const DepartureOk(this.at);
  final DateTime at;
}

class DepartureError extends Departure {
  const DepartureError(this.message);
  final String message;
}

Departure departureFrom(String? date, int? hour, String? minute, {required DateTime now, required int cutoffMinutes}) {
  if (date == null) return const DepartureError('Choose a date');
  if (hour == null || minute == null) return const DepartureError('Choose a departure time');
  final at = istToUtc(date, '${hour.toString().padLeft(2, '0')}:$minute');
  if (at.difference(now.toUtc()).inSeconds < cutoffMinutes * 60) {
    return DepartureError('Choose a time at least $cutoffMinutes minutes from now');
  }
  return DepartureOk(at);
}

/// "25/10/2027" -> "2027-10-25", or null if it isn't a real date in the future.
String? parseExpiry(String input, {DateTime? now}) {
  final m = RegExp(r'^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$').firstMatch(input.trim());
  if (m == null) return null;
  final d = int.parse(m.group(1)!);
  final mo = int.parse(m.group(2)!);
  final y = int.parse(m.group(3)!);
  final date = DateTime.utc(y, mo, d);
  if (date.year != y || date.month != mo || date.day != d) return null;
  if (date.isBefore((now ?? DateTime.now()).toUtc())) return null;
  return '$y-${mo.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';
}

/// Indian vehicle registration: MH31AB1234, DL1CAB1234, or BH series 22BH1234AB.
final RegExp vehicleRegPattern = RegExp(r'^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$');

String normalizeReg(String input) => input.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');

bool isIndianMobile(String digits) => RegExp(r'^[6-9]\d{9}$').hasMatch(digits);
