Ext.define("state-editors-by-release", {
    extend: 'Rally.app.App',

    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            settingsScopeType: null
        }
    },

    fetchList: ['FormattedID','Name','_User','_PreviousValues.ScheduleState', "ScheduleState","_ValidFrom", "Iteration", "Project","Release","_SnapshotNumber"],
    wsapiFetchList: ['FormattedID','Name','ScheduleState','Project','Iteration','Release'],

    onTimeboxScopeChange: function(timebox){
        this.logger.log('onTimeboxScopeChange',this.useDashboardScope, timebox, this.scopeType);
        if (this.useDashboardScope && timebox && timebox.type === this.scopeType){
            this._updateApp(timebox);
        }
    },
    launch: function() {

        var context = this.getContext();
        this.removeAll();

        var settingsScopeType = this.getSetting('settingsScopeType') || null,
            hasScope = this._hasScope();

        this.logger.log('launch', settingsScopeType, hasScope);
        if (settingsScopeType === null && !hasScope){
            this.add({
                xtype: 'container',
                html: 'Please select a scope type in the App settings.'
            });
            return;
        }
        if (settingsScopeType === null){
            this.scopeType = this.getContext().getTimeboxScope().type;
        } else {
            this.scopeType = settingsScopeType;
        }
        this.useDashboardScope = hasScope && settingsScopeType === null
        this._addComponents(this.useDashboardScope);

        this.onTimeboxScopeChange(context.getTimeboxScope() || null);
    },
    _hasScope: function() {
        var context = this.getContext();
        this.logger.log('_hasScope', context.getTimeboxScope());
        if (context.getTimeboxScope() && (context.getTimeboxScope().getType() === 'release' || context.getTimeboxScope().getType() === 'iteration' )){
            return true;
        }
        return false;
    },
    _addComponents: function(hasTimeboxScope){

        this.logger.log('_addComponents');

        if (!this.down('#ct-header')){
            var header = this.add({
                xtype: 'container',
                itemId: 'ct-header',
                layout: {
                    type: 'hbox'
                }
            });

            if (!hasTimeboxScope){
                if (this.scopeType === 'release'){
                    header.add({
                        xtype: 'rallyreleasecombobox',
                        storeConfig: {
                            limit: 'Infinity'
                        },
                        listeners: {
                            scope: this,
                            change: this._updateApp
                        }
                    });
                } else {
                    header.add({
                        xtype: 'rallyiterationcombobox',
                        storeConfig: {
                            limit: 'Infinity'
                        },
                        listeners: {
                            scope: this,
                            change: this._updateApp
                        }
                    });
                }
            }

            header.add({
                xtype: 'rallybutton',
                text: 'Export',
                style: {
                    float: 'right'
                },
                width: 75,
                listeners: {
                    scope: this,
                    click: this._export
                }
            });
        }

        if (this.down('#ct-display')){
            this.down('#ct-display').removeAll();
        } else {
           this.add({xtype: 'container',itemId:'ct-display'});
        }
    },
    _export: function(){
        var grid = this.down('rallygrid');
        if (grid){
            var filename = Ext.String.format('export-{0}.csv',Rally.util.DateTime.format(new Date(), 'Y-m-d'));
            var csv = Rally.technicalservices.FileUtilities.getCSVFromGrid(grid);
            Rally.technicalservices.FileUtilities.saveCSVToFile(csv,filename);
        }
    },
    _updateApp: function(timebox){
        var record = timebox && timebox.getRecord();
        this.logger.log('_updateApp',record);
        this._addComponents();
        this._fetchData(record);
    },

    _fetchData: function(record){

        if (this.down('#ct-display')){
            this.down('#ct-display').removeAll();
        }
        this.setLoading(true);

        var promises = [this._fetchCurrentTimeboxRecords(record), this._fetchSnapshots()],
            timeboxName = record ? record.get('Name') : null;

        Deft.Promise.all(promises).then({
            scope: this,
            success: function(results){
                this.logger.log('_fetchData promises returned', results);
                this._aggregateSnapshots(results[1], results[0], timeboxName);
                this.setLoading(false);
            },
            failure: function(operation){
                this.setLoading(false);
                Rally.ui.notify.Notifier.showError({message: 'Error(s) loading data for release: ' + operation.error.errors.join(',')});
            }
        });
    },
    _getStartDateName: function(timeboxType){
        if (timeboxType === 'Release'){
            return 'ReleaseStartDate';
        }
        return 'StartDate';
    },
    _getEndDateName: function(timeboxType){
        if (timeboxType === 'Release'){
            return 'ReleaseDate';
        }
        return 'EndDate';

    },
    _fetchCurrentTimeboxRecords: function(timebox){
        var deferred = Ext.create('Deft.Deferred'),
            timeboxType = this.scopeType === 'release' ? 'Release' : 'Iteration',
            filters = [{
                property: timeboxType,
                value: null
            }];

        if (timebox){
            filters = [{
                property: timeboxType + '.Name',
                value: timebox.get('Name')
            //},{
            //    property: timeboxType + '.' + this._getStartDateName(timeboxType),
            //    value: timebox.get(this._getStartDateName(timeboxType))
            //},{
            //    property: timeboxType + '.' + this._getEndDateName(timeboxType),
            //    value: timebox.get(this._getEndDateName(timeboxType))
            }];
        }

        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'HierarchicalRequirement',
            fetch: this.wsapiFetchList,
            limit: 'Infinity',
            filters: filters
        });
        this.logger.log('_fetchCurrentTimeboxRecords', filters);
        store.load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve(records);
                } else {
                    deferred.reject(operation);
                }
            }
        });
        return deferred;
    },
    _fetchSnapshots: function(){
        var deferred= Ext.create('Deft.Deferred'),
            destinationState = "Accepted";

        if (this.transitionSnapshots){
            deferred.resolve(this.transitionSnapshots);
        } else {

           this.logger.log('_fetchSnapshots', destinationState);
           var store = Ext.create('Rally.data.lookback.SnapshotStore', {
                fetch: this.fetchList,
                limit: "Infinity",
                findConfig: {
                    "_TypeHierarchy": 'HierarchicalRequirement',
                    $or: [
                        {"_PreviousValues.ScheduleState": {$gte: destinationState}, "ScheduleState": {$lt: destinationState}},
                        {"ScheduleState": {$gte: destinationState}, "_PreviousValues.ScheduleState": {$lt: destinationState}}
                    ],
                    "_ProjectHierarchy": this.getContext().getProject().ObjectID
                },
                sort: {
                    "_ValidFrom": 1
                },
               removeUnauthorizedSnapshots: true,
                hydrate: ["Project","Iteration","_PreviousValues.ScheduleState","ScheduleState","Release"]
            });
            store.load({
                scope: this,
                callback: function(records, operation, success){
                    this.logger.log('load successful?', success, records, operation);
                    if (success) {
                        this.transitionSnapshots = records;
                        deferred.resolve(records);
                    } else {
                        this.transitionSnapshots = undefined;
                        deferred.reject(operation);
                    }

                }
            });
        }
        return deferred;
    },
    _fetchStatePrecedence: function(stateField){
        var deferred = Ext.create('Deft.Deferred');

        Rally.data.ModelFactory.getModel({
            type: 'HierarchicalRequirement',
            success: function(model) {
                var allowedValues = [];
                model.getField(stateField).getAllowedValueStore().load({
                    callback: function (records, operation, success) {
                        Ext.Array.each(records, function (allowedValue) {
                            //each record is an instance of the AllowedAttributeValue model
                            allowedValues.push(allowedValue.get('StringValue'));
                        });
                        deferred.resolve(allowedValues);
                    }
                });
            }
        });
        return deferred;
    },
    _aggregateSnapshots: function(snapshots, currentData, timeboxName){

        var snaps_by_oid = {},
            scopeType = this.scopeType;
        if (snapshots){
            snaps_by_oid = this.aggregateSnapsByOidForModel(snapshots, currentData);
        }
        this.logger.log('aggregateSnapshots', timeboxName);
        var data = [],
            prevStateField = "_PreviousValues.ScheduleState",
            stateField = "ScheduleState",
            auditStateValue = "Accepted";

        this._fetchStatePrecedence(stateField).then({
            scope: this,
            success: function(allowedValues){

                var user_oids = [],
                    auditStateIndex = _.indexOf(allowedValues, auditStateValue);

                _.each(snaps_by_oid, function(snaps, oid){
                    var rec = {FormattedID: null, ObjectID: null, Name: null, ChangedByOid: null, DateChanged: null, snap: null, Iteration: null, Project: null, FirstName: '', LastName: '', UserName: ''};
                    _.each(snaps, function(snap) {
                        rec.FormattedID = snap.FormattedID;
                        rec.ObjectID = snap.ObjectID;
                        rec.Name = snap.Name;
                        rec.Project = snap.Project || '';
                        rec.Iteration = snap.Iteration || '';
                        rec.ScheduleState = snap.ScheduleState;
                        rec.Release = null;
                        if (snap.Release){
                            rec.Release = snap.Release.Name || snap.Release;
                        }
                        rec.Iteration = null;
                        if (snap.Iteration){
                            rec.Iteration = snap.Iteration.Name || snap.Iteration;
                        }

                        var prevStateIndex = _.indexOf(allowedValues,snap[prevStateField]),
                            stateIndex = _.indexOf(allowedValues, snap[stateField]);

                        /**
                         * This needs to cover 3 scenarios:
                         * 1 - transition from a lower state to the audit state
                         * 2 - transition from a lower state to a state beyond the audit state
                         * 3 - transition from a higher state to the audit state
                         * Note, we do not want to capture editor when going from the audit state to a higher state
                         */
                        if (((snap[prevStateField] && snap[prevStateField].length > 0)||snap._SnapshotNumber == 0) &&  //since we are also pulling current release records, we need to ignore what looks like the state transition for those.
                            prevStateIndex != stateIndex && stateIndex >= auditStateIndex &&
                            ((prevStateIndex < auditStateIndex) || (stateIndex == auditStateIndex))){

                            if (snap._User && !Ext.Array.contains(user_oids, snap._User)){
                                user_oids.push(snap._User);
                            }

                            rec.ChangedByOid = snap._User;
                            rec.DateChanged = snap._ValidFrom;
                        }
                        rec.snap = snap;
                    });

                    //They would like to not see last accepted if the story is not in an accepted state or above.
                    if ((_.indexOf(allowedValues, rec.ScheduleState) < auditStateIndex)){
                        rec.ChangedByOid = null;
                        rec.DateChanged = null;
                    }
                    if (scopeType === 'release' && rec.Release == timeboxName){ //they only want to see records whose current release value matches the desired value.
                        data.push(rec);
                    }
                    if (scopeType === 'iteration' && rec.Iteration == timeboxName){ //they only want to see records whose current release value matches the desired value.
                        data.push(rec);
                    }
                });

                var config = {};
                config["data"] = data;
                config["pageSize"] = data.length;

                this._hydrateUsers(config, user_oids);
            }
        });
    },
    _hydrateUsers: function(config, users){
        this.logger.log('_hydrateUsers',users);
        this._fetchUsers(users).then({
            scope: this,
            success: function(records){
                var userHash = {};
                _.each(records, function(r){
                    userHash[r.get('ObjectID')] = {
                        UserName: r.get('UserName') || '',
                        FirstName: r.get('FirstName') || '',
                        LastName: r.get('LastName') || '',
                        ObjectID: r.get('ObjectID')
                    };
                });

                _.each(config.data, function(rec){
                    var oid = rec["ChangedByOid"] || 0;

                    rec["UserName"] = oid > 0 ? (userHash[oid] ? userHash[oid].UserName || '' : 'User ' + oid ) : '';
                    rec["FirstName"] = (userHash[oid] ? userHash[oid].FirstName || '' : '');
                    rec["LastName"] = (userHash[oid] ? userHash[oid].LastName || '' : '');
                });

                this._buildGrid(config);

            },
            failure: function(errorMsg){
                Rally.ui.notify.Notifier({message: "Error hydrating users:  " + operation.error.errors.join(',')});
            }
        });
    },
    _buildGrid: function(config){
        this.logger.log('_buildGrid',config);

        var store = Ext.create('Rally.data.custom.Store', config);

        if (this.down('#rally-grid')){
            this.down('#rally-grid').destroy();
        }

        var grid = this.down('#ct-display').add({
            xtype: 'rallygrid',
            itemId: 'rally-grid',
            store: Ext.create('Rally.data.custom.Store', {
                data: config.data,
                autoLoad: true,
                remoteSort: false,
                remoteFilter: false,
                pageSize: config.pageSize,
                width: '75%'
            }),
            columnCfgs: [
                {dataIndex: 'FormattedID', text: 'FormattedID'},
                {dataIndex: 'Name', text: 'Name', flex: 1},
                {
                    dataIndex: 'ChangedByOid',
                    width: "20%",
                    text: 'Accepted By',
                    renderer: function(v,m,r){

                        if (r.get('UserName')){
                            return Ext.String.format("{0} {1} ({2})", r.get('FirstName'), r.get('LastName'), r.get('UserName'));
                        }
                        return '';
                    }
                },
                {
                    dataIndex: 'ScheduleState', text: 'Schedule State'
                },
                {dataIndex: 'DateChanged', text: 'Last Accepted Date', width: '20%',renderer: function(v){
                    if (v){
                        return Rally.util.DateTime.formatWithDefaultDateTime(Rally.util.DateTime.fromIsoString(v));
                    }
                    return '';

                }},
                {
                    dataIndex: 'Project', text: 'Project', renderer: function(v){ if (v){return v.Name || '';}}
                }

            ],
            showPagingToolbar: false
        });
    },

    _fetchUsers: function(users){
        var deferred = Ext.create('Deft.Deferred'),
            filters = [],
            promises =[];

        for (var i=0; i<users.length; i++){
            filters.push({
                property:'ObjectID',
                value: users[i]
            });

            if (i % 10 == 0 || i == users.length -1){
                var user_filter = Rally.data.wsapi.Filter.or(filters);
                promises.push(this._fetchUserChunk(user_filter));
                filters = [];
            }
        }

        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records){
                deferred.resolve(_.flatten(records));
            },
            failure: function(operation){
                deferred.reject(operation)
            }
        });
        return deferred;
    },
    _fetchUserChunk: function(user_filter){
        var deferred = Ext.create('Deft.Deferred');

        var user_store = Ext.create('Rally.data.wsapi.Store',{
            model: 'User',
            fetch: ['UserName','FirstName','LastName','ObjectID'],
            filters: user_filter
        });
        user_store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success) {
                    deferred.resolve(records);
                } else {
                    deferred.reject(operation);
                }
            }
        });
        return deferred;
    },
    aggregateSnapsByOidForModel: function(snaps, currentData){
        //Return a hash of objects (key=ObjectID) with all snapshots for the object, put the current wsapi data last.

        var snaps_by_oid = {};
        Ext.each(snaps, function(snap){

            var oid = snap.ObjectID || snap.get('ObjectID');
            if (snaps_by_oid[oid] == undefined){
                snaps_by_oid[oid] = [];
            }
            snaps_by_oid[oid].push(snap.getData());

        });
        Ext.each(currentData, function(r){
            var oid = r.get('ObjectID');
            if (snaps_by_oid[oid] == undefined){
                snaps_by_oid[oid] = [];
            }
            snaps_by_oid[oid].push(r.getData());
        });
        return snaps_by_oid;
    },
    getSettingsFields: function() {
        var store = Ext.create('Ext.data.Store',{
            data: [{name: 'Release', value: 'release'},{name: 'Iteration', value:'iteration'}],
            fields: ['name','value']
        }),
            allowBlank = this._hasScope();


        return [{
            xtype: 'rallycombobox',
            store: store,
            name: 'settingsScopeType',
            fieldLabel: 'Scope Type',
            labelAlign: 'right',
            width: 300,
            displayField: 'name',
            valueField: 'value',
            allowNoEntry: allowBlank,
            noEntryText: ' -- Use Dashboard Scope --'
        }];
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },

    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },

    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        this.launch();
    }
});
