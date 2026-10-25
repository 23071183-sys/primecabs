// PrimeCabs design tokens. Navy for structure, teal for the one main action per screen.
import 'package:flutter/material.dart';

class Brand {
  static const navy = Color(0xFF143D75);
  static const navyDark = Color(0xFF0F2F5B);
  static const teal = Color(0xFF15CEAC);
  static const tealDark = Color(0xFF0B8A72);
  static const onTeal = Color(0xFF04342C);
}

/// Colours the widgets read through `context.pc`. Light and dark variants.
@immutable
class PcColors extends ThemeExtension<PcColors> {
  const PcColors({
    required this.bg,
    required this.card,
    required this.cardMuted,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textSecondary,
    required this.textMuted,
    required this.primarySoft,
    required this.accentText,
    required this.success,
    required this.successBg,
    required this.warning,
    required this.warningBg,
    required this.danger,
    required this.dangerBg,
    required this.info,
    required this.infoBg,
  });

  final Color bg, card, cardMuted, border, borderStrong, text, textSecondary, textMuted, primarySoft, accentText;
  final Color success, successBg, warning, warningBg, danger, dangerBg, info, infoBg;

  static const light = PcColors(
    bg: Color(0xFFF4F6FA),
    card: Colors.white,
    cardMuted: Color(0xFFF1F4F9),
    border: Color(0xFFE2E7EF),
    borderStrong: Color(0xFFC9D1DD),
    text: Color(0xFF0F172A),
    textSecondary: Color(0xFF5B6678),
    textMuted: Color(0xFF8A94A6),
    primarySoft: Color(0xFFE7FAF6),
    accentText: Brand.tealDark,
    success: Color(0xFF0E7A4F),
    successBg: Color(0xFFE6F6EE),
    warning: Color(0xFF8A5A00),
    warningBg: Color(0xFFFFF4DB),
    danger: Color(0xFFB42318),
    dangerBg: Color(0xFFFDECEA),
    info: Color(0xFF1D4B8C),
    infoBg: Color(0xFFE8EFF9),
  );

  static const dark = PcColors(
    bg: Color(0xFF0B1220),
    card: Color(0xFF131C2E),
    cardMuted: Color(0xFF1A2438),
    border: Color(0xFF25324A),
    borderStrong: Color(0xFF34445F),
    text: Color(0xFFF1F5F9),
    textSecondary: Color(0xFFA8B3C4),
    textMuted: Color(0xFF76839A),
    primarySoft: Color(0xFF0F2E2A),
    accentText: Color(0xFF3AD8BB),
    success: Color(0xFF4ADE9B),
    successBg: Color(0xFF0F2E22),
    warning: Color(0xFFF5C35B),
    warningBg: Color(0xFF33270C),
    danger: Color(0xFFF97066),
    dangerBg: Color(0xFF3A1512),
    info: Color(0xFF8FB4EA),
    infoBg: Color(0xFF152846),
  );

  @override
  PcColors copyWith() => this;

  @override
  PcColors lerp(ThemeExtension<PcColors>? other, double t) => t < 0.5 ? this : (other as PcColors? ?? this);
}

extension PcContext on BuildContext {
  PcColors get pc => Theme.of(this).extension<PcColors>()!;
}

class Space {
  static const xs = 4.0, sm = 8.0, md = 12.0, lg = 16.0, xl = 20.0, xxl = 28.0;
}

/// Minimum touch target. Drivers often use the app one-handed in a car.
const double tapTarget = 48;

ThemeData pcTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? PcColors.dark : PcColors.light;
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.navy,
    brightness: brightness,
    primary: Brand.teal,
    onPrimary: Brand.onTeal,
    secondary: Brand.navy,
    surface: c.card,
    error: c.danger,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: brightness);
  OutlineInputBorder border(Color color, [double width = 1]) =>
      OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: color, width: width));

  return base.copyWith(
    scaffoldBackgroundColor: c.bg,
    extensions: [c],
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.navy,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white),
    ),
    textTheme: base.textTheme.apply(bodyColor: c.text, displayColor: c.text),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      hintStyle: TextStyle(color: c.textMuted),
      border: border(c.borderStrong),
      enabledBorder: border(c.borderStrong),
      focusedBorder: border(Brand.teal, 1.5),
      errorBorder: border(c.danger, 1.5),
      focusedErrorBorder: border(c.danger, 1.5),
      errorStyle: TextStyle(color: c.danger, fontSize: 13),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.card,
      indicatorColor: c.primarySoft,
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: const Color(0xFF0F172A),
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.bg,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    ),
    dividerTheme: DividerThemeData(color: c.border, space: 1, thickness: 1),
  );
}
