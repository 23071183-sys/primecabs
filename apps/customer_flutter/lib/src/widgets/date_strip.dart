import 'package:flutter/material.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

/// Horizontal strip of days (IST) to pick a travel date. [onNavy] styles it for the navy header.
class DateStrip extends StatefulWidget {
  const DateStrip({super.key, required this.days, required this.value, required this.onChanged, this.onNavy = false});
  final List<DayOption> days;
  final String value;
  final ValueChanged<String> onChanged;
  final bool onNavy;

  @override
  State<DateStrip> createState() => _DateStripState();
}

class _DateStripState extends State<DateStrip> {
  // Starts with the chosen day in view (for example on Results, opened with a later date).
  late final _scroll = ScrollController(initialScrollOffset: () {
    final i = widget.days.indexWhere((d) => d.date == widget.value);
    return i > 2 ? (i - 2) * 64.0 : 0.0;
  }());

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final days = widget.days, value = widget.value, onNavy = widget.onNavy, onChanged = widget.onChanged;
    return SizedBox(
      height: 72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        controller: _scroll,
        itemCount: days.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final d = days[i];
          final on = d.date == value;
          final bg = on ? (onNavy ? Brand.teal : Brand.navy) : (onNavy ? Colors.white.withValues(alpha: 0.1) : c.card);
          final fg = on ? (onNavy ? Brand.onTeal : Colors.white) : (onNavy ? Colors.white : c.text);
          final sub = on ? fg.withValues(alpha: 0.75) : (onNavy ? Colors.white60 : c.textSecondary);
          return Semantics(
            selected: on,
            button: true,
            label: '${d.weekday} ${d.day} ${d.month}',
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => onChanged(d.date),
              child: Container(
                width: 56,
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: on ? bg : (onNavy ? Colors.white24 : c.borderStrong)),
                ),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(d.weekday, style: TextStyle(fontSize: 12, color: sub)),
                  Text('${d.day}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: fg)),
                  Text(d.month, style: TextStyle(fontSize: 11, color: sub)),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }
}
