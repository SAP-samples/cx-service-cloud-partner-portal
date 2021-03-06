import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TechnicianProfileFacade } from '../../state/technician-profile.facade';
import { Observable, of, Subject } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { TechnicianProfile } from '../../models/technician-profile.model';
import { filter, map, take, takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { UnsavedConfirmationDialogComponent } from '../../../components/unsaved-confirmation-dialog/unsaved-confirmation-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ReportingFacade } from '../../../state/reporting/reporting.facade';
import { selectPerson } from '../../../state/user/user.selectors';
import { select, Store } from '@ngrx/store';
import { RootState } from '../../../state';
import { UnifiedPerson } from '../../..//model/unified-person.model';
import { RemovalConfirmationDialogComponent } from '../removal-confirmation-dialog/removal-confirmation-dialog.component';
import { CrowdType } from '../../models/crowd-type';
import { omit } from '../../../utils/omit';

interface FormDataStructure {
  about: {
    firstName: string;
    lastName: string;
    emailAddress: string;
    phoneNumber: string;
    crowdType: CrowdType;
  };
  address: {
    streetName: string;
    houseNumber: string;
    zipCode: string;
    country: string;
    city: string;
  };
}

export type WorkingMode = 'EDIT' | 'CREATE';

@Component({
  selector: 'pp-technician-details-editor',
  templateUrl: './technician-details-editor.component.html',
  styleUrls: ['./technician-details-editor.component.scss'],
})
export class TechnicianDetailsEditorComponent implements OnInit, OnDestroy {
  public isLoading: Observable<boolean> = this.profileFacade.isLoading;
  public technicianProfile: TechnicianProfile;
  public profileForm: FormGroup = this.formBuilder.group({
    about: this.formBuilder.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      emailAddress: ['', [Validators.required, Validators.email]],
      phoneNumber: [''],
      crowdType: [''],
    }),
    address: this.formBuilder.group({
      streetName: [''],
      houseNumber: [''],
      zipCode: [''],
      country: [''],
      city: [''],
    }),
  });
  public person: UnifiedPerson;
  public isBlocked: boolean;
  public isActive: boolean;
  public crowdTypes: CrowdType[] = ['PARTNER_ADMIN', 'PARTNER_TECHNICIAN'];
  private isAwaitingNavigationChange: boolean;
  private destroyed = new Subject<void>();
  private editorMode: WorkingMode;
  private isRoleChanged: boolean = false;

  constructor(
    private formBuilder: FormBuilder,
    private profileFacade: TechnicianProfileFacade,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private reportingFacade: ReportingFacade,
    private store: Store<RootState>,
  ) {
    this.editorMode = route.snapshot.data.mode;
  }

  public async onSubmit() {
    return this.mapFormToTechnicianData().then(profile => {
      if (this.editorMode === 'EDIT') {
        return this.profileFacade.saveProfile(profile);
      } else if (this.editorMode === 'CREATE') {
        return this.profileFacade.createProfile(omit({...profile, address: omit(profile.address, 'id')}, 'crowdType'));
      }
    });
  }

  public getFullName(): string {
    const {firstName, lastName} = this.technicianProfile;

    if (!firstName && !lastName) {
      return 'Unnamed';
    }

    return `${firstName} ${lastName}`;
  }

  public isLoggedInUser() {
    return this.person.id === this.technicianProfile.externalId;
  }

  public onToggleActive() {
    if (!this.isLoggedInUser()) {
      this.isActive = !this.isActive;
      this.profileForm.markAsDirty();
    }
  }

  public onRoleChanged(role: CrowdType) {
    if (role !== this.technicianProfile.crowdType) {
      this.isRoleChanged = true;
    } else {
      this.isRoleChanged = false;
    }
  }

  public ngOnInit() {
    if (this.editorMode === 'EDIT') {
      this.profileFacade.fetchTechnicianProfile(this.getTechnicianId());
    }

    this.profileFacade.fetchTags();
    this.profileFacade.technicianProfile
      .pipe(takeUntil(this.destroyed))
      .subscribe(technician => {
        this.profileForm.patchValue(this.mapTechnicianToFormData(technician));
        this.profileForm.markAsPristine();
        this.isRoleChanged = false;
        this.technicianProfile = technician;
        this.isActive = !technician.inactive;

        this.isBlocked = this.isProfileBlockedBySyncStatus();
        if (this.isBlocked) {
          this.reportingFacade.reportWarning('TECHNICIAN_PROFILE_UPDATE_BLOCKED');
        }
      });
    this.profileFacade.skillsEdited.pipe(
      takeUntil(this.destroyed),
      map(() => this.profileForm.markAsDirty()))
      .subscribe();
    this.profileFacade.isAwaitingNavigationChange
      .pipe(takeUntil(this.destroyed))
      .subscribe((navigate: boolean) => this.isAwaitingNavigationChange = navigate);
    this.store.pipe(
      select(selectPerson),
      takeUntil(this.destroyed),
      filter(person => !!person),
    )
      .subscribe(person => this.person = person);
  }

  public ngOnDestroy() {
    this.profileFacade.clearProfileData();
    this.destroyed.next();
    this.destroyed.complete();
    this.snackBar.dismiss();
  }

  public onPageLeaving(): Observable<boolean> {
    if (this.isAwaitingNavigationChange || this.profileForm.pristine) {
      return of(true);
    } else {
      return this.dialog.open(UnsavedConfirmationDialogComponent).afterClosed();
    }
  }

  public deleteTechnician(): void {
    this.dialog.open(RemovalConfirmationDialogComponent, {data: this.getFullName()})
      .afterClosed()
      .pipe(filter(confirmed => confirmed))
      .subscribe(() => this.profileFacade.deleteProfile(this.getTechnicianId()));
  }

  @HostListener('window:beforeunload', ['$event'])
  private beforeunload(event: Event) {
    if (this.profileForm.dirty) {
      event.returnValue = true;
    }
  }

  private isProfileBlockedBySyncStatus(): boolean {
    const BLOCKED_STATUS = 'BLOCKED';
    return (this.technicianProfile.syncStatus === BLOCKED_STATUS) ||
      (this.technicianProfile.address && this.technicianProfile.address.syncStatus === BLOCKED_STATUS);
  }

  private getTechnicianId(): TechnicianProfile['externalId'] {
    return this.route.snapshot.params.technicianId;
  }

  private mapTechnicianToFormData(technician: TechnicianProfile) {
    const {address} = technician;
    return {
      about: {
        firstName: technician.firstName,
        lastName: technician.lastName,
        emailAddress: technician.email,
        phoneNumber: technician.mobilePhone,
        crowdType: technician.crowdType || '',
      },
      address: !!address
        ? {
          streetName: address.streetName,
          houseNumber: address.number,
          zipCode: address.zipCode,
          city: address.city,
          country: address.country,
        }
        : {
          streetName: '',
          houseNumber: '',
          zipCode: '',
          city: '',
          country: '',
        },
    };
  }

  private mapFormToTechnicianData(): Promise<Partial<TechnicianProfile>> {
    const formData: FormDataStructure = this.profileForm.getRawValue();
    return this.profileFacade.technicianAddress.pipe(
      take(1),
      map(address => ({
        externalId: this.getTechnicianId(),
        lastName: formData.about.lastName,
        firstName: formData.about.firstName,
        email: formData.about.emailAddress,
        mobilePhone: formData.about.phoneNumber,
        inactive: !this.isActive,
        crowdType: this.isRoleChanged ? formData.about.crowdType : '',
        address: {
          id: !!address ? address.id : undefined,
          city: formData.address.city,
          country: formData.address.country,
          number: formData.address.houseNumber,
          streetName: formData.address.streetName,
          zipCode: formData.address.zipCode,
        },
      }))).toPromise();
  }
}
