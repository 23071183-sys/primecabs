import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';

class VerifyArgs {
  const VerifyArgs({required this.phone, required this.sentTo, this.devCode, this.resendIn = 30});
  final String phone, sentTo;
  final String? devCode;
  final int resendIn;
}

class VerifyScreen extends ConsumerStatefulWidget {
  const VerifyScreen({super.key, required this.args});
  final VerifyArgs args;
  @override
  ConsumerState<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends ConsumerState<VerifyScreen> {
  final _code = TextEditingController();
  String? _error;
  bool _busy = false;
  late int _wait = widget.args.resendIn;
  String? _devCode;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _devCode = widget.args.devCode;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _wait = _wait > 0 ? _wait - 1 : 0));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify(String code) async {
    if (code.length != 6 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(apiProvider).post('/auth/otp/verify', {'phone': widget.args.phone, 'otp': code, 'app': 'driver'}) as Json;
      ref.invalidate(meProvider);
      await ref.read(sessionProvider.notifier).signIn(r['token'] as String);
      if (mounted) context.go('/');
    } on ApiError catch (e) {
      setState(() => _error = e.message);
      if (e.code == 'OTP_LOCKED' || e.code == 'OTP_EXPIRED') _code.clear();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    try {
      final r = await ref.read(apiProvider).post('/auth/otp/request', {'phone': widget.args.phone, 'app': 'driver'}) as Json;
      _code.clear();
      setState(() {
        _wait = r['resendInSeconds'] as int? ?? 30;
        _error = null;
        _devCode = r['devCode'] as String?;
      });
      if (mounted) toast(context, 'New code sent');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Scaffold(
      appBar: AppBar(title: const Text('Enter code')),
      body: PcScreen(
        footer: ListenableBuilder(
          listenable: _code,
          builder: (_, _) => Btn('Verify and continue', loading: _busy, onPressed: _code.text.length == 6 ? () => _verify(_code.text) : null),
        ),
        children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Txt.h2('Enter the 6-digit code'),
            const SizedBox(height: 6),
            Txt.small('Sent by SMS to ${widget.args.sentTo}.'),
          ]),
          if (_devCode != null) PcBanner(title: 'Development mode', body: 'No SMS is sent yet. Your code is $_devCode.'),
          CodeInput(length: 6, controller: _code, error: _error != null, onChanged: (_) => setState(() => _error = null), onCompleted: _verify),
          if (_error != null) Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: c.danger, fontSize: 13)),
          Center(child: _wait > 0 ? Txt.small('Resend code in ${_wait}s') : Btn('Resend code', kind: BtnKind.ghost, expand: false, onPressed: _resend)),
          Btn('Use a different number', kind: BtnKind.ghost, onPressed: () => context.go('/sign-in')),
        ],
      ),
    );
  }
}
