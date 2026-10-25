import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_driver/src/app_state.dart';
import 'package:primecabs_driver/src/screens/sign_in_screen.dart';
import 'package:primecabs_driver/src/widgets/ride_card.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

Widget _wrap(Widget child, {List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(theme: pcTheme(Brightness.light), home: child),
    );

Json _ride(String status, {int sold = 2, String? reason}) => {
      'id': 'r1',
      'routeId': 'rt',
      'from': 'Nagpur',
      'to': 'Seoni',
      'departureAt': DateTime.now().toUtc().add(const Duration(days: 1)).toIso8601String(),
      'arrivalAt': DateTime.now().toUtc().add(const Duration(days: 1, hours: 3)).toIso8601String(),
      'status': status,
      'cancelReason': null,
      'vehicle': {'id': 'v', 'type': 'Ertiga or similar 7-seater', 'registrationNo': 'MH31AB1234'},
      'totalSeats': 6,
      'availableSeats': 6 - sold,
      'seatsSold': sold,
      'proposedSeatFare': 52000,
      'seatFare': status == 'PENDING_APPROVAL' ? null : 52000,
      'fareDecision': reason == null ? null : {'decision': 'REJECTED', 'reason': reason},
      'earnings': 0,
    };

void main() {
  group('Sign-in', () {
    testWidgets('rejects an invalid number without calling the server', (tester) async {
      var calls = 0;
      final api = ApiClient(baseUrl: 'http://test', client: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }));
      await tester.pumpWidget(_wrap(const SignInScreen(), overrides: [apiProvider.overrideWithValue(api)]));
      await tester.enterText(find.byType(TextField), '12345');
      await tester.tap(find.text('Send code'));
      await tester.pump();
      expect(find.text('Enter your 10-digit mobile number'), findsOneWidget);
      expect(calls, 0);
    });

    testWidgets("shows the server's message when the number belongs to the other app", (tester) async {
      final api = ApiClient(
        baseUrl: 'http://test',
        client: MockClient((_) async => http.Response(
            jsonEncode({'error': {'code': 'PHONE_USED_BY_OTHER_APP', 'message': 'This number is registered as a customer. Use a different number to drive.'}}), 409)),
      );
      await tester.pumpWidget(_wrap(const SignInScreen(), overrides: [apiProvider.overrideWithValue(api)]));
      await tester.enterText(find.byType(TextField), '9876543210');
      await tester.tap(find.text('Send code'));
      await tester.pumpAndSettle();
      expect(find.textContaining('registered as a customer'), findsOneWidget);
    });
  });

  group('CodeInput', () {
    testWidgets('accepts digits only, up to the length, and reports completion', (tester) async {
      String? done;
      await tester.pumpWidget(_wrap(Scaffold(body: CodeInput(length: 4, onChanged: (_) {}, onCompleted: (v) => done = v))));
      await tester.enterText(find.byType(TextField), '12a34');
      await tester.pump();
      expect(done, '1234');
      for (final d in ['1', '2', '3', '4']) {
        expect(find.text(d), findsOneWidget);
      }
    });
  });

  group('RideCard', () {
    testWidgets('shows status, seats and fare', (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(body: RideCard(ride: DriverRide.fromJson(_ride('OPEN'))))));
      expect(find.text('Live'), findsOneWidget);
      expect(find.text('2 of 6 booked'), findsOneWidget);
      expect(find.text('₹520 / seat'), findsOneWidget);
    });

    testWidgets("shows the admin's reason on a rejected ride", (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(body: RideCard(ride: DriverRide.fromJson(_ride('REJECTED', reason: 'Fare too high for this route'))))));
      expect(find.text('Not approved'), findsOneWidget);
      expect(find.text('Fare too high for this route'), findsOneWidget);
    });

    testWidgets('marks a proposed fare while waiting for approval', (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(body: RideCard(ride: DriverRide.fromJson(_ride('PENDING_APPROVAL', sold: 0))))));
      expect(find.text('Fare in review'), findsOneWidget);
      expect(find.text('₹520 / seat proposed'), findsOneWidget);
    });
  });

  group('routing by review status', () {
    Json me(String status) => {
          'id': 'd',
          'status': status,
          'phone': '+919876500011',
          'bank': {'accountName': null, 'accountNoLast4': null, 'ifsc': null, 'upiId': null},
          'vehicles': [],
          'documents': {'items': [], 'missing': []},
        };
    test('sends each status to the right place', () {
      expect(homeFor(DriverMe.fromJson(me('APPROVED'))), '/home');
      expect(homeFor(DriverMe.fromJson(me('DRAFT'))), '/onboarding');
      expect(homeFor(DriverMe.fromJson(me('REJECTED'))), '/onboarding');
      expect(homeFor(DriverMe.fromJson(me('PENDING'))), '/status');
      expect(homeFor(DriverMe.fromJson(me('SUSPENDED'))), '/status');
    });
  });
}
