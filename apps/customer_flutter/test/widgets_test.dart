import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_customer/src/app_state.dart';
import 'package:primecabs_customer/src/screens/book_screen.dart';
import 'package:primecabs_customer/src/screens/profile_screen.dart';
import 'package:primecabs_customer/src/screens/sign_in_screen.dart';
import 'package:primecabs_customer/src/screens/ticket_screen.dart';
import 'package:primecabs_customer/src/widgets/booking_card.dart';
import 'package:primecabs_customer/src/widgets/fare_summary.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

Widget _wrap(Widget child, {List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(theme: pcTheme(Brightness.light), home: child),
    );

Json _fare({String mode = 'INCLUDED', int total = 110000, int gst = 5238}) => {
      'seatFare': 50000,
      'seats': 2,
      'seatsAmount': 100000,
      'pickupExtra': 10000,
      'dropExtra': 0,
      'gstMode': mode,
      'gstRatePercent': 5,
      'gstAmount': gst,
      'total': total,
    };

Json _ticket() => {
      'id': 'b1',
      'code': 'PC-261026-1001',
      'status': 'CONFIRMED',
      'holdExpiresAt': null,
      'ride': {'id': 'r1', 'from': 'Nagpur', 'to': 'Seoni', 'departureAt': '2026-10-26T02:00:00.000Z', 'arrivalAt': '2026-10-26T04:45:00.000Z', 'status': 'OPEN'},
      'pickup': {'point': 'Nagpur Railway Station', 'address': null},
      'drop': {'point': null, 'address': 'House 12, Barapathar, Seoni'},
      'driver': {'name': 'Ramesh Kumar', 'phone': '+919000000001'},
      'vehicle': {'type': 'Sedan', 'registrationNo': 'MH31AB1234', 'make': 'Maruti', 'model': 'Dzire', 'colour': 'White'},
      'passengers': [
        {'id': 'p1', 'name': 'Anita Sharma', 'age': 34, 'gender': 'FEMALE', 'status': 'BOOKED', 'startCode': '4821', 'endCode': null},
      ],
      'fare': _fare(),
      'refunds': [],
      'cancelledAt': null,
      'support': {'phone': '+910000000000', 'email': 'support@primecabs.example'},
    };

void main() {
  group('Sign-in', () {
    testWidgets('asks the server for a customer code', (tester) async {
      Json? sent;
      final api = ApiClient(baseUrl: 'http://test', client: MockClient((req) async {
        sent = jsonDecode(req.body) as Json;
        return http.Response(jsonEncode({'sentTo': '+91 98••••3210', 'resendInSeconds': 30}), 200);
      }));
      await tester.pumpWidget(_wrap(const SignInScreen(), overrides: [apiProvider.overrideWithValue(api)]));
      await tester.enterText(find.byType(TextField), '9876543210');
      await tester.tap(find.text('Send code'));
      await tester.pump();
      expect(sent, {'phone': '9876543210', 'app': 'customer'});
    });
  });

  group('Profile', () {
    testWidgets('requires name, email, age and gender before calling the server', (tester) async {
      var puts = 0;
      final api = ApiClient(baseUrl: 'http://test', client: MockClient((req) async {
        if (req.method == 'PUT') puts++;
        return http.Response(jsonEncode({'id': 'u', 'phone': '+919000000003', 'name': null, 'email': null, 'age': null, 'gender': null, 'profileComplete': false}), 200);
      }));
      await tester.pumpWidget(_wrap(const ProfileScreen(firstTime: true), overrides: [apiProvider.overrideWithValue(api)]));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(1), 'not-an-email');
      await tester.tap(find.text('Save and continue'));
      await tester.pump();
      expect(find.text('Enter your full name'), findsOneWidget);
      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(find.text('Enter your age'), findsOneWidget);
      expect(find.text('Choose one'), findsOneWidget);
      expect(puts, 0);
    });
  });

  group('StopChoice', () {
    test('sends a point, or a home address only once it is long enough', () {
      expect(const StopChoice.point('pt1').toJson(), {'pointId': 'pt1'});
      expect(const StopChoice.home('Hse 1').toJson(), isNull);
      expect(const StopChoice.home('  House 12, Barapathar  ').toJson(), {'address': 'House 12, Barapathar'});
    });
  });

  group('FareSummary', () {
    testWidgets('shows GST inside the total when included', (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(body: FareSummary(fare: Fare.fromJson(_fare())))));
      expect(find.text('₹500 × 2 seats'), findsOneWidget);
      expect(find.text('Pickup charge'), findsOneWidget);
      expect(find.text('₹1,100'), findsOneWidget);
      expect(find.text('Includes ₹52.38 GST (5%)'), findsOneWidget);
    });

    testWidgets('adds a GST line when GST is charged on top', (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(body: FareSummary(fare: Fare.fromJson(_fare(mode: 'ADDED', total: 115500, gst: 5500))))));
      expect(find.text('GST (5%)'), findsOneWidget);
      expect(find.text('₹1,155'), findsOneWidget);
      expect(find.textContaining('Includes'), findsNothing);
    });
  });

  group('BookingCard', () {
    testWidgets('unpaid bookings say so', (tester) async {
      final b = BookingSummary.fromJson({'id': 'b', 'code': 'PC-1', 'status': 'HELD', 'seats': 1, 'total': 55000, 'from': 'Nagpur', 'to': 'Seoni', 'departureAt': '2026-10-26T02:00:00Z'});
      await tester.pumpWidget(_wrap(Scaffold(body: BookingCard(booking: b))));
      expect(find.text('Awaiting payment'), findsOneWidget);
      expect(find.text('₹550'), findsOneWidget);
    });
  });

  group('E-ticket', () {
    test('shared text has the trip but never the boarding codes', () {
      final text = shareText(Ticket.fromJson(_ticket()));
      expect(text, contains('PC-261026-1001'));
      expect(text, contains('Nagpur → Seoni'));
      expect(text, contains('Drop: House 12, Barapathar, Seoni'));
      expect(text, contains('MH31AB1234'));
      expect(text, isNot(contains('4821')));
    });

    testWidgets('shows each traveller\'s boarding code', (tester) async {
      final api = ApiClient(baseUrl: 'http://test', client: MockClient((_) async => http.Response(jsonEncode(_ticket()), 200)));
      await tester.pumpWidget(_wrap(const TicketScreen(bookingId: 'b1'), overrides: [apiProvider.overrideWithValue(api)]));
      await tester.pumpAndSettle();
      expect(find.text('Boarding code'), findsOneWidget);
      for (final d in ['4', '8', '2', '1']) {
        expect(find.text(d), findsWidgets);
      }
      expect(find.text('Ramesh Kumar'), findsOneWidget);
      expect(find.text('MH31AB1234'), findsOneWidget);
    });
  });
}
