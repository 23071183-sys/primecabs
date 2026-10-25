import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:test/test.dart';

// 25 Oct 2026, 11:00 PM IST
final now = DateTime.utc(2026, 10, 25, 17, 30);

void main() {
  group('money', () {
    test('formats paise as rupees with Indian grouping', () {
      expect(inr(55000), '₹550');
      expect(inr(5238), '₹52.38');
      expect(inr(5250), '₹52.50');
      expect(inr(10000000), '₹1,00,000');
      expect(inr(123456700), '₹12,34,567');
      expect(inr(0), '₹0');
      expect(inr(null), '—');
    });

    test('reads typed fares without floating-point errors', () {
      expect(paiseFromInput('550'), 55000);
      expect(paiseFromInput('52.5'), 5250);
      expect(paiseFromInput('₹1,200.05'), 120005);
      expect(paiseFromInput('5.555'), isNull);
      expect(paiseFromInput('abc'), isNull);
    });
  });

  group('IST time', () {
    test('formats times and days in IST', () {
      expect(time('2026-11-01T02:00:00Z'), '7:30 AM');
      expect(time('2026-11-01T11:45:00Z'), '5:15 PM');
      expect(dayLabel('2026-11-01T02:00:00Z'), 'Sun, 1 Nov');
      expect(relativeDay('2026-10-26T02:00:00Z', now: now), 'Tomorrow');
      expect(dateTime('2026-10-25T17:45:00Z', now: now), 'Today, 11:15 PM');
      expect(duration(165), '2h 45m');
      expect(duration(120), '2h');
      expect(phone('+919876543210'), '+91 98765 43210');
    });

    test('converts between IST wall time and UTC instants', () {
      expect(istToUtc('2026-11-01', '07:30'), DateTime.utc(2026, 11, 1, 2, 0));
      final ist = utcToIst('2026-11-01T02:00:00.000Z');
      expect(ist.date, '2026-11-01');
      expect(ist.time, '07:30');
      expect(istDateString(now: DateTime.utc(2026, 10, 31, 19)), '2026-11-01'); // 00:30 IST
    });
  });

  group('publishing schedule', () {
    test('lists days from today in IST', () {
      final days = nextDays(3, now: now);
      expect(days.map((d) => d.date), ['2026-10-25', '2026-10-26', '2026-10-27']);
      expect(days[0].weekday, 'Today');
      expect(days[1].weekday, 'Tmrw');
      expect(days[2].weekday, 'Tue');
    });

    test('enforces the booking cutoff (exactly the cutoff is allowed)', () {
      expect(departureFrom('2026-10-25', 23, '00', now: now, cutoffMinutes: 15), isA<DepartureError>());
      final ok = departureFrom('2026-10-25', 23, '15', now: now, cutoffMinutes: 15);
      expect((ok as DepartureOk).at, DateTime.utc(2026, 10, 25, 17, 45));
      expect((departureFrom('2026-10-26', null, null, now: now, cutoffMinutes: 15) as DepartureError).message, 'Choose a departure time');
    });

    test('labels hours', () {
      expect([hourLabel(4), hourLabel(12), hourLabel(13), hourLabel(23)], ['4 AM', '12 PM', '1 PM', '11 PM']);
    });
  });

  group('validation', () {
    test('document expiry dates', () {
      expect(parseExpiry('25/10/2027', now: now), '2027-10-25');
      expect(parseExpiry('1-2-2030', now: now), '2030-02-01');
      expect(parseExpiry('31/02/2030', now: now), isNull);
      expect(parseExpiry('01/01/2020', now: now), isNull);
    });

    test('vehicle numbers and mobile numbers', () {
      expect(vehicleRegPattern.hasMatch(normalizeReg('mh 31 ab 1234')), isTrue);
      expect(vehicleRegPattern.hasMatch('22BH1234AA'), isTrue);
      expect(vehicleRegPattern.hasMatch('MH31AB12'), isFalse);
      expect(isIndianMobile('9876543210'), isTrue);
      expect(isIndianMobile('5876543210'), isFalse);
    });
  });

  group('models', () {
    test('parse a driver ride from the API shape', () {
      final r = DriverRide.fromJson({
        'id': 'r1',
        'routeId': 'rt',
        'from': 'Nagpur',
        'to': 'Seoni',
        'departureAt': '2026-10-26T02:00:00.000Z',
        'arrivalAt': '2026-10-26T04:45:00.000Z',
        'status': 'PENDING_APPROVAL',
        'cancelReason': null,
        'vehicle': {'id': 'v', 'type': 'SUV', 'registrationNo': 'MH31CD4321'},
        'totalSeats': 6,
        'availableSeats': 6,
        'seatsSold': 0,
        'proposedSeatFare': 52000,
        'seatFare': null,
        'fareDecision': {'decision': 'PENDING', 'reason': null},
        'earnings': 0,
      });
      expect(r.status, RideStatus.pendingApproval);
      expect(r.fareDecision!.decision, 'PENDING');
      expect(r.seatFare, isNull);
    });

    test('parse passenger statuses', () {
      final p = Passenger.fromJson({
        'id': 'p',
        'bookingCode': 'PC-261025-1003',
        'name': 'Meena Joshi',
        'phone': '+919812300001',
        'age': 52,
        'gender': 'FEMALE',
        'status': 'NO_SHOW',
        'pickup': 'Railway Station',
        'drop': null,
      });
      expect(p.status, PassengerStatus.noShow);
    });
  });

  group('ApiClient', () {
    test('sends the token and decodes JSON', () async {
      late http.Request seen;
      final api = ApiClient(
        baseUrl: 'https://api.example/',
        token: 't0k',
        client: MockClient((req) async {
          seen = req;
          return http.Response(jsonEncode({'ok': true}), 200);
        }),
      );
      final r = await api.get('/driver/rides', query: {'scope': 'upcoming', 'empty': ''});
      expect(r, {'ok': true});
      expect(seen.url.toString(), 'https://api.example/api/v1/driver/rides?scope=upcoming');
      expect(seen.headers['authorization'], 'Bearer t0k');
    });

    test("surfaces the server's error and field messages", () async {
      final api = ApiClient(
        baseUrl: 'https://api.example',
        client: MockClient((_) async => http.Response(
              jsonEncode({
                'error': {
                  'code': 'VALIDATION_FAILED',
                  'message': 'Enter a valid 10-digit Indian mobile number',
                  'details': {
                    'fields': [
                      {'path': 'phone', 'message': 'Enter a valid 10-digit Indian mobile number'}
                    ]
                  }
                }
              }),
              400,
            )),
      );
      try {
        await api.post('/auth/otp/request', {'phone': '123'});
        fail('should throw');
      } on ApiError catch (e) {
        expect(e.status, 400);
        expect(e.code, 'VALIDATION_FAILED');
        expect(e.field('phone'), 'Enter a valid 10-digit Indian mobile number');
      }
    });

    test('calls onUnauthorized on 401 except for sign-in routes', () async {
      var signedOut = 0;
      final api = ApiClient(
        baseUrl: 'https://api.example',
        onUnauthorized: () => signedOut++,
        client: MockClient((_) async => http.Response(jsonEncode({'error': {'code': 'UNAUTHORIZED', 'message': 'Sign in'}}), 401)),
      );
      await expectLater(api.get('/driver/me'), throwsA(isA<ApiError>()));
      await expectLater(api.post('/auth/otp/verify'), throwsA(isA<ApiError>()));
      expect(signedOut, 1);
    });

    test('reports network failures in plain words', () async {
      final api = ApiClient(baseUrl: 'https://api.example', client: MockClient((_) async => throw Exception('socket')));
      await expectLater(api.get('/config'), throwsA(predicate((e) => e is ApiError && e.code == 'NETWORK')));
    });

    test('uploads fields before the file', () async {
      late http.Request seen;
      final api = ApiClient(
        baseUrl: 'https://api.example',
        client: MockClient((req) async {
          seen = req;
          return http.Response(jsonEncode({'id': 'd1', 'status': 'PENDING'}), 201);
        }),
      );
      await api.upload('/driver/documents',
          fields: {'documentTypeId': 'dt1', 'expiryDate': '2028-03-31'},
          file: const UploadFile(bytes: [0x89, 0x50], filename: 'doc.png', mimeType: 'image/png'));
      final body = latin1.decode(seen.bodyBytes); // the file part is binary, not UTF-8
      expect(body.indexOf('name="documentTypeId"'), lessThan(body.indexOf('name="file"')));
      expect(body, contains('content-type: image/png'));
    });
  });
}
