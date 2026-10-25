import 'package:url_launcher/url_launcher.dart';

/// Opens the phone dialler with [number].
Future<void> callNumber(String number) => launchUrl(Uri(scheme: 'tel', path: number.replaceAll(' ', '')));
