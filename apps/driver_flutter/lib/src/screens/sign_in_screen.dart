import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import 'verify_screen.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});
  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phone = TextEditingController();
  bool _touched = false, _busy = false;
  String? _apiError;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _touched = true);
    if (!isIndianMobile(_phone.text)) return;
    setState(() {
      _busy = true;
      _apiError = null;
    });
    try {
      final r = await ref.read(apiProvider).post('/auth/otp/request', {'phone': _phone.text, 'app': 'driver'}) as Json;
      if (!mounted) return;
      context.push('/verify', extra: VerifyArgs(phone: _phone.text, sentTo: r['sentTo'] as String, devCode: r['devCode'] as String?, resendIn: r['resendInSeconds'] as int? ?? 30));
    } on ApiError catch (e) {
      setState(() => _apiError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final phoneError = _touched && !isIndianMobile(_phone.text) ? 'Enter your 10-digit mobile number' : null;
    return Scaffold(
      body: ListView(padding: EdgeInsets.zero, children: [
        Container(
          decoration: const BoxDecoration(color: Brand.navy, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
          padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 48, 20, 48),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.directions_car_filled, color: Brand.teal, size: 28),
            ),
            const SizedBox(height: 20),
            const Txt.h1('PrimeCabs Driver', color: Colors.white),
            const SizedBox(height: 6),
            Txt.body('Publish your intercity rides and fill every seat.', color: Colors.white.withValues(alpha: 0.75)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Txt.title('Sign in or create your account'),
            const SizedBox(height: 16),
            PcField(
              label: 'Mobile number',
              controller: _phone,
              prefix: '+91',
              placeholder: '98765 43210',
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumberNational],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
              error: phoneError,
              onChanged: (_) => setState(() => _apiError = null),
              onSubmitted: (_) => _send(),
            ),
            if (_apiError != null) ...[const SizedBox(height: 8), Text(_apiError!, style: TextStyle(color: c.danger, fontSize: 13))],
            const SizedBox(height: 16),
            Btn('Send code', icon: Icons.sms_outlined, loading: _busy, onPressed: _send),
            const SizedBox(height: 12),
            const Txt.caption("We'll send a 6-digit code by SMS. Standard SMS charges may apply.", align: TextAlign.center),
          ]),
        ),
      ]),
    );
  }
}
