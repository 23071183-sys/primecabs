// Shared building blocks for the PrimeCabs Flutter apps.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'theme.dart';

// ---------- Text ----------

class Txt extends StatelessWidget {
  const Txt.h1(this.text, {super.key, this.color, this.align}) : _size = 26, _weight = FontWeight.w700, _muted = 0;
  const Txt.h2(this.text, {super.key, this.color, this.align}) : _size = 22, _weight = FontWeight.w700, _muted = 0;
  const Txt.title(this.text, {super.key, this.color, this.align}) : _size = 18, _weight = FontWeight.w600, _muted = 0;
  const Txt.body(this.text, {super.key, this.color, this.align}) : _size = 15, _weight = FontWeight.w400, _muted = 0;
  const Txt.strong(this.text, {super.key, this.color, this.align}) : _size = 15, _weight = FontWeight.w600, _muted = 0;
  const Txt.small(this.text, {super.key, this.color, this.align}) : _size = 13, _weight = FontWeight.w400, _muted = 1;
  const Txt.caption(this.text, {super.key, this.color, this.align}) : _size = 12, _weight = FontWeight.w400, _muted = 2;
  const Txt.label(this.text, {super.key, this.color, this.align}) : _size = 12, _weight = FontWeight.w700, _muted = 3;

  final String text;
  final Color? color;
  final TextAlign? align;
  final double _size;
  final FontWeight _weight;
  final int _muted;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final base = switch (_muted) { 1 => c.textSecondary, 2 => c.textMuted, 3 => c.textSecondary, _ => c.text };
    return Text(
      _muted == 3 ? text.toUpperCase() : text,
      textAlign: align,
      style: TextStyle(fontSize: _size, fontWeight: _weight, color: color ?? base, height: 1.35, letterSpacing: _muted == 3 ? 0.6 : 0),
    );
  }
}

// ---------- Buttons ----------

enum BtnKind { primary, secondary, danger, ghost }

class Btn extends StatelessWidget {
  const Btn(this.label, {super.key, this.onPressed, this.kind = BtnKind.primary, this.loading = false, this.icon, this.compact = false, this.expand = true});

  final String label;
  final VoidCallback? onPressed;
  final BtnKind kind;
  final bool loading, compact, expand;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final (bg, fg, side) = switch (kind) {
      BtnKind.primary => (Brand.teal, Brand.onTeal, BorderSide.none),
      BtnKind.secondary => (c.card, c.text, BorderSide(color: c.borderStrong)),
      BtnKind.danger => (c.card, c.danger, BorderSide(color: c.dangerBg, width: 1.5)),
      BtnKind.ghost => (Colors.transparent, c.accentText, BorderSide.none),
    };
    // While loading the button ignores taps, so a double tap can't submit twice.
    final disabled = onPressed == null;
    final child = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (loading)
          SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
        else if (icon != null)
          Icon(icon, size: 20, color: fg),
        if (loading || icon != null) const SizedBox(width: 8),
        Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: compact ? 15 : 16, fontWeight: kind == BtnKind.primary ? FontWeight.w700 : FontWeight.w600, color: fg))),
      ],
    );
    return Semantics(
      button: true,
      enabled: !disabled,
      label: label,
      excludeSemantics: true,
      child: Opacity(
        opacity: disabled ? 0.45 : 1,
        child: SizedBox(
          height: compact ? tapTarget - 2 : 54,
          width: expand ? double.infinity : null,
          child: TextButton(
            onPressed: disabled || loading ? (loading ? () {} : null) : onPressed,
            style: TextButton.styleFrom(
              backgroundColor: bg,
              foregroundColor: fg,
              disabledForegroundColor: fg,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: side),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

// ---------- Surfaces ----------

class PcCard extends StatelessWidget {
  const PcCard({super.key, required this.child, this.onTap, this.highlight = false, this.padding = const EdgeInsets.all(16), this.color});
  final Widget child;
  final VoidCallback? onTap;
  final bool highlight;
  final EdgeInsets padding;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Material(
      color: color ?? c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: highlight ? Brand.teal : c.border, width: highlight ? 1.5 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }
}

// ---------- Status ----------

enum Tone { success, warning, danger, info, neutral }

(Color, Color) _tone(PcColors c, Tone t) => switch (t) {
      Tone.success => (c.successBg, c.success),
      Tone.warning => (c.warningBg, c.warning),
      Tone.danger => (c.dangerBg, c.danger),
      Tone.info => (c.infoBg, c.info),
      Tone.neutral => (c.cardMuted, c.textSecondary),
    };

class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, this.tone = Tone.neutral, this.icon});
  final String label;
  final Tone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _tone(context.pc, tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 4)],
        Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class PcBanner extends StatelessWidget {
  const PcBanner({super.key, required this.body, this.title, this.tone = Tone.info, this.action});
  final String body;
  final String? title;
  final Tone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _tone(context.pc, tone);
    final icon = switch (tone) { Tone.danger => Icons.error_outline, Tone.warning => Icons.schedule, Tone.success => Icons.check_circle_outline, _ => Icons.info_outline };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: fg, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (title != null) Text(title!, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 15)),
              Text(body, style: TextStyle(color: fg, fontSize: 13, height: 1.4)),
              if (action != null) action!,
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Seat-fill bar: one segment per seat.
class SeatBar extends StatelessWidget {
  const SeatBar({super.key, required this.sold, required this.total});
  final int sold, total;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Semantics(
      label: '$sold of $total seats booked',
      child: Row(
        children: [
          for (var i = 0; i < total; i++) ...[
            if (i > 0) const SizedBox(width: 4),
            Expanded(child: Container(height: 6, decoration: BoxDecoration(color: i < sold ? Brand.teal : c.border, borderRadius: BorderRadius.circular(3)))),
          ],
        ],
      ),
    );
  }
}

// ---------- Forms ----------

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(text, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.pc.textSecondary)));
}

class PcField extends StatelessWidget {
  const PcField({
    super.key,
    required this.label,
    this.controller,
    this.error,
    this.hint,
    this.placeholder,
    this.prefix,
    this.suffix,
    this.keyboardType,
    this.inputFormatters,
    this.obscure = false,
    this.maxLength,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.enabled = true,
    this.autofocus = false,
  });

  final String label;
  final TextEditingController? controller;
  final String? error, hint, placeholder, prefix, suffix;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final bool obscure, enabled, autofocus;
  final int? maxLength;
  final int maxLines;
  final ValueChanged<String>? onChanged, onSubmitted;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      FieldLabel(label),
      TextField(
        controller: controller,
        keyboardType: keyboardType,
        inputFormatters: inputFormatters,
        obscureText: obscure,
        maxLength: maxLength,
        maxLines: maxLines,
        enabled: enabled,
        autofocus: autofocus,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        textCapitalization: textCapitalization,
        autofillHints: autofillHints,
        style: TextStyle(fontSize: 16, color: c.text),
        decoration: InputDecoration(
          hintText: placeholder,
          errorText: error,
          helperText: error == null ? hint : null,
          helperMaxLines: 3,
          errorMaxLines: 3,
          helperStyle: TextStyle(color: c.textMuted, fontSize: 13),
          counterText: '',
          // prefixIcon/suffixIcon (not prefixText) so '+91' and units show before the field is focused.
          prefixIcon: prefix == null ? null : Padding(padding: const EdgeInsets.only(left: 14, right: 6), child: Text(prefix!, style: TextStyle(fontSize: 16, color: c.textSecondary))),
          prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
          suffixIcon: suffix == null ? null : Padding(padding: const EdgeInsets.only(left: 6, right: 14), child: Text(suffix!, style: TextStyle(fontSize: 15, color: c.textSecondary))),
          suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
          fillColor: enabled ? c.card : c.cardMuted,
        ),
      ),
    ]);
  }
}

class ChoiceOption<T> {
  const ChoiceOption(this.value, this.label, {this.hint});
  final T value;
  final String label;
  final String? hint;
}

/// Pick one of a few options, shown as large pills.
class PcChoice<T> extends StatelessWidget {
  const PcChoice({super.key, required this.options, required this.value, required this.onChanged, this.label, this.error});
  final List<ChoiceOption<T>> options;
  final T? value;
  final ValueChanged<T> onChanged;
  final String? label, error;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (label != null) FieldLabel(label!),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final o in options)
          Semantics(
            selected: o.value == value,
            button: true,
            child: Material(
              color: o.value == value ? c.primarySoft : c.card,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: o.value == value ? Brand.teal : c.borderStrong, width: o.value == value ? 1.5 : 1),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => onChanged(o.value),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: tapTarget - 4),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(o.label, style: TextStyle(fontSize: 15, fontWeight: o.value == value ? FontWeight.w700 : FontWeight.w500, color: c.text)),
                      if (o.hint != null) Text(o.hint!, style: TextStyle(fontSize: 12, color: c.textSecondary)),
                    ]),
                  ),
                ),
              ),
            ),
          ),
      ]),
      if (error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(error!, style: TextStyle(color: c.danger, fontSize: 13))),
    ]);
  }
}

class PcStepper extends StatelessWidget {
  const PcStepper({super.key, required this.label, required this.value, required this.min, required this.max, required this.onChanged, this.hint});
  final String label;
  final int value, min, max;
  final ValueChanged<int> onChanged;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    Widget btn(IconData icon, int next, String a11y) => Semantics(
          button: true,
          label: a11y,
          child: SizedBox(
            width: 52,
            height: 52,
            child: OutlinedButton(
              onPressed: next < min || next > max ? null : () => onChanged(next),
              style: OutlinedButton.styleFrom(padding: EdgeInsets.zero, side: BorderSide(color: c.borderStrong), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              child: Icon(icon, color: c.text),
            ),
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      FieldLabel(label),
      Row(children: [
        btn(Icons.remove, value - 1, 'Fewer'),
        SizedBox(width: 56, child: Text('$value', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: c.text))),
        btn(Icons.add, value + 1, 'More'),
      ]),
      if (hint != null) Padding(padding: const EdgeInsets.only(top: 6), child: Txt.small(hint!)),
    ]);
  }
}

/// Large one-digit-per-box code entry (4 for trip codes, 6 for sign-in).
class CodeInput extends StatefulWidget {
  const CodeInput({super.key, required this.length, required this.onChanged, this.onCompleted, this.error = false, this.autofocus = true, this.controller});
  final int length;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;
  final bool error, autofocus;
  final TextEditingController? controller;

  @override
  State<CodeInput> createState() => _CodeInputState();
}

class _CodeInputState extends State<CodeInput> {
  late final TextEditingController _ctrl = widget.controller ?? TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    if (widget.controller == null) _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return GestureDetector(
      onTap: () => _focus.requestFocus(),
      child: Stack(children: [
        // The real input sits underneath, transparent; the boxes only display its value.
        Opacity(
          opacity: 0,
          child: TextField(
            controller: _ctrl,
            focusNode: _focus,
            autofocus: widget.autofocus,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(widget.length)],
            onChanged: (v) {
              setState(() {});
              widget.onChanged(v);
              if (v.length == widget.length) widget.onCompleted?.call(v);
            },
          ),
        ),
        ListenableBuilder(
          listenable: Listenable.merge([_ctrl, _focus]),
          builder: (context, _) => Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < widget.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Flexible(
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 58),
                    height: 60,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: c.card,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: widget.error ? c.danger : (i < _ctrl.text.length || (i == _ctrl.text.length && _focus.hasFocus) ? Brand.teal : c.borderStrong),
                        width: i <= _ctrl.text.length ? 1.5 : 1,
                      ),
                    ),
                    child: Text(i < _ctrl.text.length ? _ctrl.text[i] : '', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: c.text)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ]),
    );
  }
}

// ---------- States ----------

class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.height = 16, this.width, this.radius = 8});
  final double height;
  final double? width;
  final double radius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);

  @override
  void dispose() {
    _a.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Loading',
        child: FadeTransition(
          opacity: Tween(begin: 0.45, end: 1.0).animate(_a),
          child: Container(height: widget.height, width: widget.width, decoration: BoxDecoration(color: context.pc.border, borderRadius: BorderRadius.circular(widget.radius))),
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, this.body, this.action});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
      child: Column(children: [
        CircleAvatar(radius: 26, backgroundColor: c.cardMuted, child: Icon(icon, color: c.textSecondary)),
        const SizedBox(height: 10),
        Txt.strong(title, align: TextAlign.center),
        if (body != null) ...[const SizedBox(height: 4), Txt.small(body!, align: TextAlign.center)],
        if (action != null) ...[const SizedBox(height: 14), action!],
      ]),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => EmptyView(
        icon: Icons.cloud_off_outlined,
        title: "Couldn't load this",
        body: message,
        action: onRetry == null ? null : Btn('Try again', kind: BtnKind.secondary, icon: Icons.refresh, onPressed: onRetry),
      );
}

/// Label and value on one row, for detail cards.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.strong = false, this.valueColor, this.valueWidget});
  final String label;
  final String value;
  final bool strong;
  final Color? valueColor;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          Expanded(child: Txt.small(label)),
          const SizedBox(width: 12),
          valueWidget ?? (strong ? Txt.title(value, color: valueColor) : Txt.body(value, color: valueColor)),
        ]),
      );
}

/// Tappable list row with an icon, title, subtitle and trailing content.
class ListRow extends StatelessWidget {
  const ListRow({super.key, required this.title, this.icon, this.subtitle, this.trailing, this.onTap});
  final IconData? icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: tapTarget + 8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(children: [
            if (icon != null) ...[
              Container(width: 38, height: 38, decoration: BoxDecoration(color: c.cardMuted, borderRadius: BorderRadius.circular(12)), child: Icon(icon, size: 20, color: c.textSecondary)),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Txt.strong(title),
                if (subtitle != null) Txt.small(subtitle!),
              ]),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            if (onTap != null) Icon(Icons.chevron_right, color: c.textMuted),
          ]),
        ),
      ),
    );
  }
}

/// Bottom sheet with a title, scrollable content and an optional pinned footer.
Future<T?> showPcSheet<T>(BuildContext context, {required String title, required WidgetBuilder builder, WidgetBuilder? footer}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Txt.title(title)),
        Flexible(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 12), child: builder(ctx))),
        if (footer != null) Padding(padding: const EdgeInsets.fromLTRB(20, 4, 20, 20), child: footer(ctx)),
      ]),
    ),
  );
}

/// Short confirmation or error message at the bottom of the screen.
void toast(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger?.hideCurrentSnackBar();
  messenger?.showSnackBar(SnackBar(
    duration: Duration(milliseconds: error ? 4500 : 2800),
    content: Row(children: [
      Icon(error ? Icons.error_outline : Icons.check_circle, color: error ? const Color(0xFFF97066) : const Color(0xFF3AD8BB), size: 18),
      const SizedBox(width: 8),
      Expanded(child: Text(message)),
    ]),
  ));
}
